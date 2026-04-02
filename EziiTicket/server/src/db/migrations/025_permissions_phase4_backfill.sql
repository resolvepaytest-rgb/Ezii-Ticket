begin;

-- Phase 4: ensure canonical screen/action keys exist on every role with safe defaults.
with screen_defaults as (
  select jsonb_object_agg(
    k,
    jsonb_build_object('view', false, 'modify', false)
  ) as obj
  from unnest(array[
    'dashboard',
    'tickets',
    'users',
    'roles_permissions',
    'teams_queues',
    'routing_rules',
    'priority_master',
    'keyword_routing',
    'sla_policies',
    'notification_templates',
    'canned_responses',
    'custom_fields',
    'api_tokens',
    'webhooks',
    'audit_logs',
    'customer_dashboard',
    'my_tickets',
    'raise_a_ticket',
    'guides'
  ]::text[]) as t(k)
),
action_defaults as (
  select jsonb_object_agg(k, false) as obj
  from unnest(array[
    'tickets.list',
    'tickets.list_my',
    'tickets.read',
    'tickets.create',
    'tickets.reply',
    'tickets.internal_notes.read',
    'tickets.attach',
    'tickets.attach_download',
    'tickets.status_change',
    'tickets.escalate',
    'tickets.request_escalation',
    'tickets.reopen',
    'tickets.assign',
    'notifications.read',
    'notifications.mark_read',
    'roles.read',
    'roles.manage',
    'users.read',
    'users.manage',
    'routing_rules.manage',
    'priority_master.manage',
    'keyword_routing.manage',
    'sla.policies.manage',
    'notification_templates.manage',
    'canned_responses.manage',
    'custom_fields.manage',
    'api_tokens.manage',
    'webhooks.manage',
    'audit_logs.read'
  ]::text[]) as t(k)
)
update roles r
set permissions_json = jsonb_set(
  jsonb_set(
    coalesce(r.permissions_json, '{}'::jsonb),
    '{screen_access}',
    coalesce((select obj from screen_defaults), '{}'::jsonb) || coalesce(r.permissions_json->'screen_access', '{}'::jsonb),
    true
  ),
  '{actions}',
  coalesce((select obj from action_defaults), '{}'::jsonb) || coalesce(r.permissions_json->'actions', '{}'::jsonb),
  true
);

-- Preserve legacy key sync during transition:
-- dashboard <-> customer_dashboard
-- tickets <-> my_tickets
with role_screen as (
  select
    id,
    coalesce(permissions_json->'screen_access', '{}'::jsonb) as sa
  from roles
),
merged as (
  select
    id,
    jsonb_build_object(
      'view',
      coalesce((sa#>>'{dashboard,view}')::boolean, false)
      or coalesce((sa#>>'{customer_dashboard,view}')::boolean, false),
      'modify',
      coalesce((sa#>>'{dashboard,modify}')::boolean, false)
      or coalesce((sa#>>'{customer_dashboard,modify}')::boolean, false)
    ) as dashboard_pair,
    jsonb_build_object(
      'view',
      coalesce((sa#>>'{tickets,view}')::boolean, false)
      or coalesce((sa#>>'{my_tickets,view}')::boolean, false),
      'modify',
      coalesce((sa#>>'{tickets,modify}')::boolean, false)
      or coalesce((sa#>>'{my_tickets,modify}')::boolean, false)
    ) as tickets_pair
  from role_screen
)
update roles r
set permissions_json = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        coalesce(r.permissions_json, '{}'::jsonb),
        '{screen_access,dashboard}',
        m.dashboard_pair,
        true
      ),
      '{screen_access,customer_dashboard}',
      m.dashboard_pair,
      true
    ),
    '{screen_access,tickets}',
    m.tickets_pair,
    true
  ),
  '{screen_access,my_tickets}',
  m.tickets_pair,
  true
)
from merged m
where m.id = r.id;

commit;


begin;

-- Phase 5 bridge:
-- Seed action baselines for default template roles.
-- Safety guard: only seed roles that currently have zero TRUE action grants,
-- so customized roles with explicit grants are not overwritten.

with target_roles as (
  select
    r.id,
    lower(replace(trim(r.name), ' ', '_')) as role_key,
    coalesce(r.permissions_json, '{}'::jsonb) as p
  from roles r
  where r.is_default = true
    and lower(replace(trim(r.name), ' ', '_')) in (
      'customer',
      'org_admin',
      'l1_agent',
      'l2_specialist',
      'l3_engineer',
      'team_lead',
      'system_admin'
    )
    and not exists (
      select 1
      from jsonb_each(coalesce(r.permissions_json->'actions', '{}'::jsonb)) as e(k, v)
      where e.v = 'true'::jsonb
    )
),
baseline(role_key, actions) as (
  values
    (
      'customer',
      jsonb_build_object(
        'notifications.read', true,
        'notifications.mark_read', true,
        'tickets.list_my', true,
        'tickets.read', true,
        'tickets.create', true,
        'tickets.reply', true,
        'tickets.attach', true,
        'tickets.attach_download', true,
        'tickets.request_escalation', true,
        'tickets.reopen', true
      )
    ),
    (
      'org_admin',
      jsonb_build_object(
        'notifications.read', true,
        'notifications.mark_read', true,
        'tickets.list', true,
        'tickets.list_my', true,
        'tickets.read', true,
        'tickets.create', true,
        'tickets.reply', true,
        'tickets.attach', true,
        'tickets.attach_download', true,
        'tickets.status_change', true,
        'tickets.escalate', true,
        'tickets.request_escalation', true,
        'tickets.reopen', true,
        'roles.read', true,
        'roles.manage', true,
        'users.read', true,
        'users.manage', true,
        'routing_rules.manage', true,
        'priority_master.manage', true,
        'keyword_routing.manage', true,
        'sla.policies.manage', true,
        'notification_templates.manage', true,
        'canned_responses.manage', true,
        'custom_fields.manage', true,
        'api_tokens.manage', true,
        'webhooks.manage', true,
        'audit_logs.read', true
      )
    ),
    (
      'l1_agent',
      jsonb_build_object(
        'notifications.read', true,
        'notifications.mark_read', true,
        'tickets.list', true,
        'tickets.list_my', true,
        'tickets.read', true,
        'tickets.create', true,
        'tickets.reply', true,
        'tickets.internal_notes.read', true,
        'tickets.attach', true,
        'tickets.attach_download', true,
        'tickets.status_change', true,
        'tickets.escalate', true,
        'tickets.reopen', true,
        'tickets.assign', true
      )
    ),
    (
      'l2_specialist',
      jsonb_build_object(
        'notifications.read', true,
        'notifications.mark_read', true,
        'tickets.list', true,
        'tickets.list_my', true,
        'tickets.read', true,
        'tickets.create', true,
        'tickets.reply', true,
        'tickets.internal_notes.read', true,
        'tickets.attach', true,
        'tickets.attach_download', true,
        'tickets.status_change', true,
        'tickets.escalate', true,
        'tickets.reopen', true,
        'tickets.assign', true
      )
    ),
    (
      'l3_engineer',
      jsonb_build_object(
        'notifications.read', true,
        'notifications.mark_read', true,
        'tickets.list', true,
        'tickets.list_my', true,
        'tickets.read', true,
        'tickets.create', true,
        'tickets.reply', true,
        'tickets.internal_notes.read', true,
        'tickets.attach', true,
        'tickets.attach_download', true,
        'tickets.status_change', true,
        'tickets.escalate', true,
        'tickets.reopen', true,
        'tickets.assign', true
      )
    ),
    (
      'team_lead',
      jsonb_build_object(
        'notifications.read', true,
        'notifications.mark_read', true,
        'tickets.list', true,
        'tickets.list_my', true,
        'tickets.read', true,
        'tickets.create', true,
        'tickets.reply', true,
        'tickets.internal_notes.read', true,
        'tickets.attach', true,
        'tickets.attach_download', true,
        'tickets.status_change', true,
        'tickets.escalate', true,
        'tickets.reopen', true,
        'tickets.assign', true,
        'roles.read', true,
        'users.read', true,
        'routing_rules.manage', true,
        'priority_master.manage', true,
        'keyword_routing.manage', true,
        'sla.policies.manage', true,
        'notification_templates.manage', true,
        'canned_responses.manage', true,
        'custom_fields.manage', true,
        'api_tokens.manage', true,
        'webhooks.manage', true,
        'audit_logs.read', true
      )
    ),
    (
      'system_admin',
      jsonb_build_object(
        'tickets.list', true,
        'tickets.list_my', true,
        'tickets.read', true,
        'tickets.create', true,
        'tickets.reply', true,
        'tickets.internal_notes.read', true,
        'tickets.attach', true,
        'tickets.attach_download', true,
        'tickets.status_change', true,
        'tickets.escalate', true,
        'tickets.request_escalation', true,
        'tickets.reopen', true,
        'tickets.assign', true,
        'notifications.read', true,
        'notifications.mark_read', true,
        'roles.read', true,
        'roles.manage', true,
        'users.read', true,
        'users.manage', true,
        'routing_rules.manage', true,
        'priority_master.manage', true,
        'keyword_routing.manage', true,
        'sla.policies.manage', true,
        'notification_templates.manage', true,
        'canned_responses.manage', true,
        'custom_fields.manage', true,
        'api_tokens.manage', true,
        'webhooks.manage', true,
        'audit_logs.read', true
      )
    )
)
update roles r
set permissions_json = jsonb_set(
  tr.p,
  '{actions}',
  coalesce(tr.p->'actions', '{}'::jsonb) || b.actions,
  true
)
from target_roles tr
join baseline b on b.role_key = tr.role_key
where r.id = tr.id;

commit;


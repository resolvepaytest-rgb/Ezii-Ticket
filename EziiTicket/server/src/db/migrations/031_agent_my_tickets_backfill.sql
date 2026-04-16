begin;

-- Ensure Team/Agent roles always include the "My Tickets" screen and required actions.
with target_roles as (
  select
    r.id,
    coalesce(r.permissions_json, '{}'::jsonb) as p
  from roles r
  where lower(replace(trim(r.name), ' ', '_')) in (
    'l1_agent',
    'l2_specialist',
    'l3_engineer',
    'team_lead'
  )
)
update roles r
set permissions_json = jsonb_set(
  jsonb_set(
    tr.p,
    '{screen_access}',
    coalesce(tr.p->'screen_access', '{}'::jsonb) || jsonb_build_object(
      'agent_my_tickets', jsonb_build_object('view', true, 'modify', true)
    ),
    true
  ),
  '{actions}',
  coalesce(tr.p->'actions', '{}'::jsonb) || jsonb_build_object(
    'tickets.list_my', true,
    'tickets.reply', true,
    'tickets.status_change', true,
    'tickets.escalate', true,
    'tickets.reopen', true,
    'tickets.attach', true,
    'tickets.attach_download', true
  ),
  true
)
from target_roles tr
where r.id = tr.id;

commit;

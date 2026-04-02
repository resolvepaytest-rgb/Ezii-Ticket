begin;

-- Backfill screen_access for all roles that do not yet have it persisted.
-- Non-system roles: every screen gets view=true, modify=false.
-- system_admin: view=true and modify=true for every screen.

update roles
set permissions_json = jsonb_set(
  coalesce(permissions_json, '{}'::jsonb),
  '{screen_access}',
  case lower(name)
    when 'system_admin' then
      '{"audit_logs":{"view":true,"modify":true},"api_tokens":{"view":true,"modify":true},"canned_responses":{"view":true,"modify":true},"custom_fields":{"view":true,"modify":true},"dashboard":{"view":true,"modify":true},"notification_templates":{"view":true,"modify":true},"roles_permissions":{"view":true,"modify":true},"routing_rules":{"view":true,"modify":true},"sla_policies":{"view":true,"modify":true},"teams_queues":{"view":true,"modify":true},"tickets":{"view":true,"modify":true},"users":{"view":true,"modify":true},"webhooks":{"view":true,"modify":true}}'::jsonb
    else
      '{"audit_logs":{"view":true,"modify":false},"api_tokens":{"view":true,"modify":false},"canned_responses":{"view":true,"modify":false},"custom_fields":{"view":true,"modify":false},"dashboard":{"view":true,"modify":false},"notification_templates":{"view":true,"modify":false},"roles_permissions":{"view":true,"modify":false},"routing_rules":{"view":true,"modify":false},"sla_policies":{"view":true,"modify":false},"teams_queues":{"view":true,"modify":false},"tickets":{"view":true,"modify":false},"users":{"view":true,"modify":false},"webhooks":{"view":true,"modify":false}}'::jsonb
  end,
  true
)
where coalesce(permissions_json, '{}'::jsonb)->'screen_access' is null
   or coalesce(permissions_json, '{}'::jsonb)->'screen_access' = '{}'::jsonb;

commit;

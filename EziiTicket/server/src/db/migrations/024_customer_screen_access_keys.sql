begin;

-- Ensure new customer-specific screen keys exist for every role.
-- Keep default as no access unless explicitly enabled.
update roles
set permissions_json = jsonb_set(
  coalesce(permissions_json, '{}'::jsonb),
  '{screen_access}',
  coalesce(permissions_json->'screen_access', '{}'::jsonb)
    || jsonb_build_object(
      'customer_dashboard',
      coalesce(permissions_json#>'{screen_access,customer_dashboard}', '{"view":false,"modify":false}'::jsonb),
      'my_tickets',
      coalesce(permissions_json#>'{screen_access,my_tickets}', '{"view":false,"modify":false}'::jsonb),
      'raise_a_ticket',
      coalesce(permissions_json#>'{screen_access,raise_a_ticket}', '{"view":false,"modify":false}'::jsonb),
      'guides',
      coalesce(permissions_json#>'{screen_access,guides}', '{"view":false,"modify":false}'::jsonb)
    ),
  true
);

-- Baseline customer defaults: all customer screens fully enabled.
update roles
set permissions_json = jsonb_set(
  coalesce(permissions_json, '{}'::jsonb),
  '{screen_access}',
  coalesce(permissions_json->'screen_access', '{}'::jsonb)
    || jsonb_build_object(
      'customer_dashboard', '{"view":true,"modify":true}'::jsonb,
      'my_tickets', '{"view":true,"modify":true}'::jsonb,
      'raise_a_ticket', '{"view":true,"modify":true}'::jsonb,
      'guides', '{"view":true,"modify":true}'::jsonb
    ),
  true
)
where lower(name) = 'customer';

commit;


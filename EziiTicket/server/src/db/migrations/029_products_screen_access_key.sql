begin;

-- Replace legacy `products` screen key with `agent` in permissions_json.screen_access.
-- If `agent` already exists, keep it. Otherwise inherit from `products` if present.
-- If neither exists, default org_admin to enabled and others to disabled.

update roles r
set permissions_json = jsonb_set(
  coalesce(r.permissions_json, '{}'::jsonb),
  '{screen_access}',
  (
    coalesce(r.permissions_json->'screen_access', '{}'::jsonb) - 'products'
  ) || jsonb_build_object(
    'agent',
    coalesce(
      r.permissions_json#>'{screen_access,agent}',
      r.permissions_json#>'{screen_access,products}',
      case
        when lower(replace(trim(r.name), ' ', '_')) = 'org_admin'
          then jsonb_build_object('view', true, 'modify', true)
        else jsonb_build_object('view', false, 'modify', false)
      end
    )
  ),
  true
);

commit;

begin;

-- Ensure org 1 has org_admin as a default role.
insert into roles (organisation_id, name, description, permissions_json, is_default)
values (
  1,
  'org_admin',
  'Customer org admin; can access org tickets',
  '{}'::jsonb,
  true
)
on conflict (organisation_id, name) do update
  set is_default = true,
      description = excluded.description;

commit;


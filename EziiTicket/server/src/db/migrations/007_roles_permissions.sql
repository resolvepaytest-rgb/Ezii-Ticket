begin;

alter table roles
  add column if not exists permissions_json jsonb not null default '{}'::jsonb,
  add column if not exists is_default boolean not null default false;

-- Seed default role permission matrix (data-only; authorization does not use this yet).
update roles
set is_default = true,
    permissions_json = '{}'::jsonb
where name = 'customer';

update roles
set is_default = true,
    permissions_json = '{}'::jsonb
where name = 'org_admin';

update roles
set is_default = true,
    permissions_json = '{}'::jsonb
where name = 'agent';

update roles
set is_default = true,
    permissions_json = '{}'::jsonb
where name = 'team_lead';

update roles
set is_default = true,
    permissions_json = '{}'::jsonb
where name = 'system_admin';

commit;


begin;

alter table roles
  add column if not exists organisation_id bigint references organisations(id) on delete cascade;

-- Existing role rows are treated as Ezii org defaults.
update roles
set organisation_id = 1
where organisation_id is null;

alter table roles
  alter column organisation_id set not null;

alter table roles
  drop constraint if exists roles_name_key;

create unique index if not exists roles_org_name_unique_idx
  on roles (organisation_id, name);

commit;


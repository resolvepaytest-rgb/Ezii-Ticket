begin;

-- Rename designation tables → org support level (routing tier; not job title)
alter table if exists designations rename to org_support_levels;

alter table if exists user_designations rename to user_org_support_levels;

alter table user_org_support_levels rename column designation_id to support_level_id;

-- Rename indexes created in 013 (names may vary; ignore if missing)
do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relname = 'designations_org_code_unique' and n.nspname = 'public') then
    execute 'alter index designations_org_code_unique rename to org_support_levels_org_code_unique';
  end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relname = 'designations_org_name_unique' and n.nspname = 'public') then
    execute 'alter index designations_org_name_unique rename to org_support_levels_org_name_unique';
  end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relname = 'user_designations_user_active_idx' and n.nspname = 'public') then
    execute 'alter index user_designations_user_active_idx rename to user_org_support_levels_user_active_idx';
  end if;
exception when others then
  null;
end $$;

-- Per-role scope: who/what this permission template applies to (ticket access filtering)
alter table roles add column if not exists apply_role_to text not null default 'all';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'roles_apply_role_to_check') then
    alter table roles add constraint roles_apply_role_to_check
      check (apply_role_to in ('all', 'reportees', 'attribute', 'sub_attribute'));
  end if;
end $$;

alter table roles add column if not exists apply_attribute_id text null;
alter table roles add column if not exists apply_sub_attribute_id text null;
alter table roles add column if not exists apply_worker_type_id bigint null;

comment on column roles.apply_role_to is 'Scope for ticket APIs: all | reportees | attribute | sub_attribute';
comment on column roles.apply_attribute_id is 'When apply_role_to=attribute: external attribute_id (string)';
comment on column roles.apply_sub_attribute_id is 'When apply_role_to=sub_attribute: external attribute_sub_id (string)';
comment on column roles.apply_worker_type_id is 'Optional: external worker_type id for reportees / HR scope';

commit;

begin;

alter table roles
  add column if not exists role_type text;

update roles
set role_type = case
  when lower(regexp_replace(trim(replace(name, '_', ' ')), '\s+', ' ', 'g')) = 'customer' then 'customer_org'
  when lower(regexp_replace(trim(replace(name, '_', ' ')), '\s+', ' ', 'g')) = 'org admin'
    then case when organisation_id = 1 then 'internal_support' else 'customer_org' end
  when organisation_id = 1 then 'internal_support'
  else 'customer_org'
end
where role_type is null
   or role_type not in ('internal_support', 'customer_org');

alter table roles
  alter column role_type set default 'customer_org';

alter table roles
  alter column role_type set not null;

alter table roles
  drop constraint if exists roles_role_type_check;

alter table roles
  add constraint roles_role_type_check
  check (role_type in ('internal_support', 'customer_org'));

commit;


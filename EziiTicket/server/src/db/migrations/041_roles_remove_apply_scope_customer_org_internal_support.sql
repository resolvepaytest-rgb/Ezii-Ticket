begin;

update roles
set apply_role_to = 'all'
where apply_role_to in ('customer_org', 'internal_support');

alter table roles
  drop constraint if exists roles_apply_role_to_check;

alter table roles
  add constraint roles_apply_role_to_check
  check (apply_role_to in ('all', 'reportees', 'worker_type', 'attribute'));

comment on column roles.apply_role_to is
  'Scope for ticket APIs: all | reportees | worker_type | attribute';

commit;

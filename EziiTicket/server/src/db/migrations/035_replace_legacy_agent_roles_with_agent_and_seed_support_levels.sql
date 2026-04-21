begin;

with orgs as (
  select distinct organisation_id
  from roles
)
insert into roles (organisation_id, name, description, permissions_json, is_default)
select
  o.organisation_id,
  'agent',
  'Support agent; workspace access is defined by role and routing stage by support level',
  coalesce((
    select r.permissions_json
    from roles r
    where r.organisation_id = o.organisation_id
      and lower(trim(r.name)) in ('l1_agent', 'l2_specialist', 'l3_engineer')
    order by r.id asc
    limit 1
  ), '{}'::jsonb),
  true
from orgs o
on conflict (organisation_id, name) do update
set description = excluded.description,
    permissions_json = case
      when roles.permissions_json is null or roles.permissions_json = '{}'::jsonb
        then excluded.permissions_json
      else roles.permissions_json
    end,
    is_default = true;

update org_support_levels
set code = 'L1',
    name = 'L1',
    description = 'Level 1 routing tier',
    is_default = true,
    updated_at = now()
where lower(trim(coalesce(code, ''))) in ('l1', 'l1_agent')
   or lower(trim(coalesce(name, ''))) in ('l1', 'l1_agent');

update org_support_levels
set code = 'L2',
    name = 'L2',
    description = 'Level 2 routing tier',
    is_default = true,
    updated_at = now()
where lower(trim(coalesce(code, ''))) in ('l2', 'l2_specialist')
   or lower(trim(coalesce(name, ''))) in ('l2', 'l2_specialist');

update org_support_levels
set code = 'L3',
    name = 'L3',
    description = 'Level 3 routing tier',
    is_default = true,
    updated_at = now()
where lower(trim(coalesce(code, ''))) in ('l3', 'l3_engineer')
   or lower(trim(coalesce(name, ''))) in ('l3', 'l3_engineer');

with orgs as (
  select distinct organisation_id
  from roles
)
insert into org_support_levels (organisation_id, code, name, description, is_default)
select o.organisation_id, x.code, x.name, x.description, true
from orgs o
cross join (
  values
    ('L1', 'L1', 'Level 1 routing tier'),
    ('L2', 'L2', 'Level 2 routing tier'),
    ('L3', 'L3', 'Level 3 routing tier')
) as x(code, name, description)
where not exists (
  select 1
  from org_support_levels osl
  where osl.organisation_id = o.organisation_id
    and lower(trim(osl.code)) = lower(trim(x.code))
);

update user_roles ur
set role_id = agent_role.id
from roles legacy_role
join roles agent_role
  on agent_role.organisation_id = legacy_role.organisation_id
 and lower(trim(agent_role.name)) = 'agent'
where legacy_role.id = ur.role_id
  and lower(trim(legacy_role.name)) in ('l1_agent', 'l2_specialist', 'l3_engineer');

update user_scope_org uso
set ticket_role = agent_role.name,
    ticket_role_id = agent_role.id,
    updated_at = now()
from roles legacy_role
join roles agent_role
  on agent_role.organisation_id = legacy_role.organisation_id
 and lower(trim(agent_role.name)) = 'agent'
where legacy_role.id = uso.ticket_role_id
  and lower(trim(legacy_role.name)) in ('l1_agent', 'l2_specialist', 'l3_engineer');

delete from roles
where lower(trim(name)) in ('l1_agent', 'l2_specialist', 'l3_engineer');

commit;

begin;

-- Phase 1.2 seed data for ticket API verification.
-- Safe to run multiple times: inserts are idempotent.
-- Default target org is 1.

-- 1) Ensure organisation row exists (matches JWT org_id=1 test setups).
insert into organisations (id, name, support_email, timezone, logo_url, portal_subdomain, created_at, updated_at)
overriding system value
select 1, 'Organisation 1', null, 'Asia/Kolkata', null, null, now(), now()
where not exists (select 1 from organisations where id = 1);

-- 2) Ensure standard products exist.
insert into products (name, code, default_ticket_prefix)
values
  ('Payroll', 'PAY', 'PAY'),
  ('Leave', 'LEA', 'LEA'),
  ('Attendance', 'ATT', 'ATT'),
  ('Expense', 'EXP', 'EXP')
on conflict (code) do nothing;

-- 3) Ensure org-product enablement + default queue linkage for Payroll.
with payroll as (
  select id as product_id from products where code = 'PAY'
)
insert into organisation_products (organisation_id, product_id, default_routing_queue_id, enabled, created_at, updated_at)
select 1, p.product_id, null, true, now(), now()
from payroll p
where not exists (
  select 1 from organisation_products op where op.organisation_id = 1 and op.product_id = p.product_id
);

update organisation_products op
set enabled = true,
    updated_at = now()
from products p
where op.organisation_id = 1
  and op.product_id = p.id
  and p.code = 'PAY';

-- 4) Ensure one active agent user and team membership for least-loaded assignment.
insert into users (user_id, organisation_id, name, email, phone, user_type, status, created_at, updated_at)
select 900001, 1, 'Phase1 Agent', 'phase1.agent@local.test', null, 'employee', 'active', now(), now()
where not exists (select 1 from users where user_id = 900001);

with payroll as (
  select id as product_id from products where code = 'PAY'
)
insert into teams (name, product_id, organisation_id, created_at, updated_at)
select 'Payroll L1 Team', p.product_id, 1, now(), now()
from payroll p
where not exists (
  select 1 from teams t where t.organisation_id = 1 and t.name = 'Payroll L1 Team'
);

with t as (
  select id from teams where organisation_id = 1 and name = 'Payroll L1 Team' limit 1
)
insert into team_members (team_id, user_id, is_team_lead, max_open_tickets_cap, created_at)
select t.id, 900001, false, 50, now()
from t
where not exists (
  select 1 from team_members tm where tm.team_id = t.id and tm.user_id = 900001
);

-- 5) Queue for Payroll team.
with payroll as (
  select id as product_id from products where code = 'PAY'
),
team_ref as (
  select id as team_id from teams where organisation_id = 1 and name = 'Payroll L1 Team' limit 1
)
insert into queues (name, product_id, team_id, organisation_id, created_at, updated_at)
select 'Payroll L1 Queue', p.product_id, t.team_id, 1, now(), now()
from payroll p
cross join team_ref t
where not exists (
  select 1 from queues q where q.organisation_id = 1 and q.name = 'Payroll L1 Queue'
);

with q as (
  select q.id as queue_id, p.id as product_id
  from queues q
  join products p on p.id = q.product_id
  where q.organisation_id = 1 and q.name = 'Payroll L1 Queue' and p.code = 'PAY'
  limit 1
)
update organisation_products op
set default_routing_queue_id = q.queue_id,
    updated_at = now()
from q
where op.organisation_id = 1
  and op.product_id = q.product_id;

-- 6) Category + sub-category used by test ticket payload.
with payroll as (
  select id as product_id from products where code = 'PAY'
)
insert into product_categories (organisation_id, product_id, name, sort_order, is_active, created_at, updated_at)
select 1, p.product_id, 'Payroll Processing', 10, true, now(), now()
from payroll p
where not exists (
  select 1
  from product_categories pc
  where pc.organisation_id = 1 and pc.product_id = p.product_id and lower(pc.name) = lower('Payroll Processing')
);

with c as (
  select id as category_id
  from product_categories
  where organisation_id = 1 and lower(name) = lower('Payroll Processing')
  order by id asc
  limit 1
)
insert into product_subcategories (category_id, name, sort_order, is_active, created_at, updated_at)
select c.category_id, 'Bulk Upload Error', 10, true, now(), now()
from c
where not exists (
  select 1
  from product_subcategories ps
  where ps.category_id = c.category_id and lower(ps.name) = lower('Bulk Upload Error')
);

-- 7) Routing rule with richer conditions (affected users + keywords).
with q as (
  select id as queue_id, team_id
  from queues
  where organisation_id = 1 and name = 'Payroll L1 Queue'
  order by id asc
  limit 1
),
payroll as (
  select id as product_id from products where code = 'PAY'
)
insert into routing_rules (organisation_id, name, priority_order, is_active, conditions_json, actions_json, created_at, updated_at)
select
  1,
  'Phase1 Payroll route',
  10,
  true,
  jsonb_build_object(
    'product_ids', jsonb_build_array(payroll.product_id),
    'channels', jsonb_build_array('widget', 'portal'),
    'keywords_any', jsonb_build_array('payroll', 'bulk'),
    'min_affected_users', 1
  )::text,
  jsonb_build_object(
    'queue_id', q.queue_id,
    'team_id', q.team_id,
    'priority_override', 'P3'
  )::text,
  now(),
  now()
from q, payroll
where not exists (
  select 1 from routing_rules rr where rr.organisation_id = 1 and rr.name = 'Phase1 Payroll route'
);

-- 8) Minimal active Tier1 SLA for P3.
insert into sla_policies
  (organisation_id, name, tier, priority, first_response_mins, resolution_mins, warning_percent, is_active, created_at, updated_at)
select 1, 'Phase1 Tier1 P3', 'tier1', 'P3', 60, 480, 75, true, now(), now()
where not exists (
  select 1
  from sla_policies
  where organisation_id = 1 and lower(tier) = 'tier1' and upper(priority) = 'P3' and name = 'Phase1 Tier1 P3'
);

commit;


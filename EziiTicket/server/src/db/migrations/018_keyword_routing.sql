begin;

-- Per-org keyword triggers: substring match on subject+description → P1 + L3 queue when ticket is created.
create table if not exists keyword_routing_entries (
  id bigint generated always as identity primary key,
  organisation_id bigint not null references organisations(id) on delete cascade,
  product_id bigint not null references products(id) on delete restrict,
  phrase text not null,
  phrase_normalized text generated always as (lower(trim(phrase))) stored,
  is_active boolean not null default true,
  is_system_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, product_id, phrase_normalized)
);

create index if not exists keyword_routing_entries_org_product_idx
  on keyword_routing_entries (organisation_id, product_id, is_active);

comment on table keyword_routing_entries is 'Trigger phrases per org product; ticket creation sets P1 and routes to L3 queue when matched.';

-- Seed defaults for every existing organisation (one row per phrase).
insert into keyword_routing_entries (organisation_id, product_id, phrase, is_system_default, is_active)
select o.id, p.id, v.phrase, true, true
from organisations o
cross join (values
  ('PAY', 'salary not processed'),
  ('PAY', 'payroll failed'),
  ('PAY', 'wrong salary'),
  ('PAY', 'data breach'),
  ('PAY', 'all employees'),
  ('PAY', 'statutory deadline'),
  ('LEA', 'leave data lost'),
  ('LEA', 'negative balance for all'),
  ('LEA', 'carry-forward wiped'),
  ('LEA', 'compliance audit'),
  ('ATT', 'all punches missing'),
  ('ATT', 'biometric data loss'),
  ('ATT', 'regularisation closed for all'),
  ('ATT', 'payroll sync failed'),
  ('EXP', 'reimbursement for all'),
  ('EXP', 'advance not disbursed'),
  ('EXP', 'data corruption'),
  ('EXP', 'audit requirement')
) as v(code, phrase)
join products p on p.code = v.code
on conflict (organisation_id, product_id, phrase_normalized) do nothing;

commit;

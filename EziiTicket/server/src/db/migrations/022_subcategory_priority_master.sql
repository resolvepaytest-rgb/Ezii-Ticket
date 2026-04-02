begin;

-- SLA priority per org + product + category + sub-category (separate from routing_rules)
create table if not exists subcategory_priority_master (
  id bigint generated always as identity primary key,
  organisation_id bigint not null references organisations(id) on delete cascade,
  product_id bigint not null references products(id) on delete cascade,
  category_id bigint not null references product_categories(id) on delete cascade,
  sub_category_id bigint not null references product_subcategories(id) on delete cascade,
  priority text not null check (priority in ('P1', 'P2', 'P3', 'P4')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, product_id, category_id, sub_category_id)
);

create index if not exists subcategory_priority_master_org_idx
  on subcategory_priority_master (organisation_id, product_id);

-- One-time copy from legacy PM-style routing_rules (exact triple + priority fields)
insert into subcategory_priority_master (organisation_id, product_id, category_id, sub_category_id, priority)
select distinct on (rr.organisation_id, ids.p_id, ids.c_id, ids.s_id)
  rr.organisation_id,
  ids.p_id,
  ids.c_id,
  ids.s_id,
  case upper(trim(coalesce(rr.conditions_json::jsonb->>'priority', (coalesce(rr.actions_json, '{}'))::jsonb->>'ticket_priority', 'P3')))
    when 'P1' then 'P1'
    when 'P2' then 'P2'
    when 'P3' then 'P3'
    when 'P4' then 'P4'
    else 'P3'
  end
from routing_rules rr
cross join lateral (
  select
    (rr.conditions_json::jsonb->'product_ids'->>0)::bigint as p_id,
    (rr.conditions_json::jsonb->'category_ids'->>0)::bigint as c_id,
    (rr.conditions_json::jsonb->'sub_category_ids'->>0)::bigint as s_id
) ids
where rr.conditions_json is not null
  and rr.conditions_json <> ''
  and jsonb_typeof(rr.conditions_json::jsonb->'product_ids') = 'array'
  and jsonb_array_length(rr.conditions_json::jsonb->'product_ids') = 1
  and jsonb_array_length(rr.conditions_json::jsonb->'category_ids') = 1
  and jsonb_array_length(rr.conditions_json::jsonb->'sub_category_ids') = 1
  and (
    (rr.conditions_json::jsonb ? 'priority')
    or ((coalesce(rr.actions_json, '{}'))::jsonb ? 'ticket_priority')
  )
  and ids.p_id is not null
  and ids.c_id is not null
  and ids.s_id is not null
order by rr.organisation_id, ids.p_id, ids.c_id, ids.s_id, rr.id
on conflict (organisation_id, product_id, category_id, sub_category_id) do nothing;

commit;

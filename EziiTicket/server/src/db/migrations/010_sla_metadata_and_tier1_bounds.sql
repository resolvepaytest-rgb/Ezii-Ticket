begin;

-- Ensure global org exists for FK-backed defaults
insert into organisations (id, name, support_email, timezone, logo_url, portal_subdomain, created_at, updated_at)
overriding system value
select 1, 'Ezii HQ', null, 'Asia/Kolkata', null, null, now(), now()
where not exists (select 1 from organisations where id = 1);

-- Optional JSON: Tier 2 internal milestones; Tier 1 customer visibility flags, etc.
alter table sla_policies add column if not exists metadata_json text;

-- System Admin configurable min/max for Tier 1 (customer-facing) SLA per org + priority
create table if not exists sla_tier1_bounds (
  organisation_id bigint not null references organisations(id) on delete cascade,
  priority text not null,
  min_first_response_mins int not null,
  max_first_response_mins int not null,
  min_resolution_mins int not null,
  max_resolution_mins int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organisation_id, priority),
  constraint sla_tier1_bounds_priority_chk check (priority in ('P1','P2','P3','P4'))
);

create index if not exists sla_tier1_bounds_org_idx on sla_tier1_bounds (organisation_id);

-- Default Tier 1 bounds (editable per org via API); seed for org 1 as template
insert into sla_tier1_bounds (organisation_id, priority, min_first_response_mins, max_first_response_mins, min_resolution_mins, max_resolution_mins)
values
  (1, 'P1', 15, 120, 120, 480),
  (1, 'P2', 60, 360, 240, 960),
  (1, 'P3', 240, 720, 960, 2880),
  (1, 'P4', 1440, 1440, 2400, 10080)
on conflict (organisation_id, priority) do update set
  min_first_response_mins = excluded.min_first_response_mins,
  max_first_response_mins = excluded.max_first_response_mins,
  min_resolution_mins = excluded.min_resolution_mins,
  max_resolution_mins = excluded.max_resolution_mins,
  updated_at = now();

-- PRD defaults: Tier 1 customer-facing (org 1 global), Tier 2 internal Ezii (org 1 only)
do $$
begin
  -- Tier 1 — global defaults at organisation_id = 1
  if exists (select 1 from sla_policies where organisation_id = 1 and lower(tier) = 'tier1' and priority = 'P1') then
    update sla_policies
    set name = 'Global P1 Tier 1 (Customer)',
        first_response_mins = 30,
        resolution_mins = 240,
        warning_percent = 75,
        is_active = true,
        metadata_json = '{"visible_to_customer":true,"definition":"System-wide outage or data corruption; payroll run or compliance at risk"}'
    where organisation_id = 1 and lower(tier) = 'tier1' and priority = 'P1';
  else
    insert into sla_policies (organisation_id, name, tier, priority, first_response_mins, resolution_mins, warning_percent, is_active, metadata_json)
    values (1, 'Global P1 Tier 1 (Customer)', 'tier1', 'P1', 30, 240, 75, true,
      '{"visible_to_customer":true,"definition":"System-wide outage or data corruption; payroll run or compliance at risk"}');
  end if;

  if exists (select 1 from sla_policies where organisation_id = 1 and lower(tier) = 'tier1' and priority = 'P2') then
    update sla_policies
    set name = 'Global P2 Tier 1 (Customer)',
        first_response_mins = 120,
        resolution_mins = 480,
        warning_percent = 75,
        is_active = true,
        metadata_json = '{"visible_to_customer":true,"definition":"Major feature broken; significant users impacted; no workaround"}'
    where organisation_id = 1 and lower(tier) = 'tier1' and priority = 'P2';
  else
    insert into sla_policies (organisation_id, name, tier, priority, first_response_mins, resolution_mins, warning_percent, is_active, metadata_json)
    values (1, 'Global P2 Tier 1 (Customer)', 'tier1', 'P2', 120, 480, 75, true,
      '{"visible_to_customer":true,"definition":"Major feature broken; significant users impacted; no workaround"}');
  end if;

  if exists (select 1 from sla_policies where organisation_id = 1 and lower(tier) = 'tier1' and priority = 'P3') then
    update sla_policies
    set name = 'Global P3 Tier 1 (Customer)',
        first_response_mins = 240,
        resolution_mins = 1440,
        warning_percent = 75,
        is_active = true,
        metadata_json = '{"visible_to_customer":true,"definition":"Feature impaired; moderate impact; workaround available"}'
    where organisation_id = 1 and lower(tier) = 'tier1' and priority = 'P3';
  else
    insert into sla_policies (organisation_id, name, tier, priority, first_response_mins, resolution_mins, warning_percent, is_active, metadata_json)
    values (1, 'Global P3 Tier 1 (Customer)', 'tier1', 'P3', 240, 1440, 75, true,
      '{"visible_to_customer":true,"definition":"Feature impaired; moderate impact; workaround available"}');
  end if;

  if exists (select 1 from sla_policies where organisation_id = 1 and lower(tier) = 'tier1' and priority = 'P4') then
    update sla_policies
    set name = 'Global P4 Tier 1 (Customer)',
        first_response_mins = 480,
        resolution_mins = 3360,
        warning_percent = 75,
        is_active = true,
        metadata_json = '{"visible_to_customer":true,"definition":"Minor issue, cosmetic defect, general query, or enhancement request"}'
    where organisation_id = 1 and lower(tier) = 'tier1' and priority = 'P4';
  else
    insert into sla_policies (organisation_id, name, tier, priority, first_response_mins, resolution_mins, warning_percent, is_active, metadata_json)
    values (1, 'Global P4 Tier 1 (Customer)', 'tier1', 'P4', 480, 3360, 75, true,
      '{"visible_to_customer":true,"definition":"Minor issue, cosmetic defect, general query, or enhancement request"}');
  end if;

  -- Tier 2 — internal Ezii SLA (non-customer); first_response = L2 ack, resolution = L3 resolution; full ladder in metadata_json
  if exists (select 1 from sla_policies where organisation_id = 1 and lower(tier) = 'tier2' and priority = 'P1') then
    update sla_policies
    set name = 'Global P1 Tier 2 (Internal Ezii)',
        first_response_mins = 15,
        resolution_mins = 240,
        warning_percent = 75,
        is_active = true,
        metadata_json = '{"l2_acknowledgement_mins":15,"l2_resolution_pass_mins":120,"l3_acknowledgement_mins":30,"l3_resolution_mins":240,"configurable":false}'
    where organisation_id = 1 and lower(tier) = 'tier2' and priority = 'P1';
  else
    insert into sla_policies (organisation_id, name, tier, priority, first_response_mins, resolution_mins, warning_percent, is_active, metadata_json)
    values (1, 'Global P1 Tier 2 (Internal Ezii)', 'tier2', 'P1', 15, 240, 75, true,
      '{"l2_acknowledgement_mins":15,"l2_resolution_pass_mins":120,"l3_acknowledgement_mins":30,"l3_resolution_mins":240,"configurable":false}');
  end if;

  if exists (select 1 from sla_policies where organisation_id = 1 and lower(tier) = 'tier2' and priority = 'P2') then
    update sla_policies
    set name = 'Global P2 Tier 2 (Internal Ezii)',
        first_response_mins = 60,
        resolution_mins = 480,
        warning_percent = 75,
        is_active = true,
        metadata_json = '{"l2_acknowledgement_mins":60,"l2_resolution_pass_mins":240,"l3_acknowledgement_mins":120,"l3_resolution_mins":480,"configurable":false}'
    where organisation_id = 1 and lower(tier) = 'tier2' and priority = 'P2';
  else
    insert into sla_policies (organisation_id, name, tier, priority, first_response_mins, resolution_mins, warning_percent, is_active, metadata_json)
    values (1, 'Global P2 Tier 2 (Internal Ezii)', 'tier2', 'P2', 60, 480, 75, true,
      '{"l2_acknowledgement_mins":60,"l2_resolution_pass_mins":240,"l3_acknowledgement_mins":120,"l3_resolution_mins":480,"configurable":false}');
  end if;

  if exists (select 1 from sla_policies where organisation_id = 1 and lower(tier) = 'tier2' and priority = 'P3') then
    update sla_policies
    set name = 'Global P3 Tier 2 (Internal Ezii)',
        first_response_mins = 240,
        resolution_mins = 1440,
        warning_percent = 75,
        is_active = true,
        metadata_json = '{"l2_acknowledgement_mins":240,"l2_resolution_pass_mins":960,"l3_acknowledgement_mins":480,"l3_resolution_mins":1440,"configurable":false}'
    where organisation_id = 1 and lower(tier) = 'tier2' and priority = 'P3';
  else
    insert into sla_policies (organisation_id, name, tier, priority, first_response_mins, resolution_mins, warning_percent, is_active, metadata_json)
    values (1, 'Global P3 Tier 2 (Internal Ezii)', 'tier2', 'P3', 240, 1440, 75, true,
      '{"l2_acknowledgement_mins":240,"l2_resolution_pass_mins":960,"l3_acknowledgement_mins":480,"l3_resolution_mins":1440,"configurable":false}');
  end if;

  if exists (select 1 from sla_policies where organisation_id = 1 and lower(tier) = 'tier2' and priority = 'P4') then
    update sla_policies
    set name = 'Global P4 Tier 2 (Internal Ezii)',
        first_response_mins = 480,
        resolution_mins = 3360,
        warning_percent = 75,
        is_active = true,
        metadata_json = '{"l2_acknowledgement_mins":480,"l2_resolution_pass_mins":2400,"l3_acknowledgement_mins":960,"l3_resolution_mins":3360,"configurable":false}'
    where organisation_id = 1 and lower(tier) = 'tier2' and priority = 'P4';
  else
    insert into sla_policies (organisation_id, name, tier, priority, first_response_mins, resolution_mins, warning_percent, is_active, metadata_json)
    values (1, 'Global P4 Tier 2 (Internal Ezii)', 'tier2', 'P4', 480, 3360, 75, true,
      '{"l2_acknowledgement_mins":480,"l2_resolution_pass_mins":2400,"l3_acknowledgement_mins":960,"l3_resolution_mins":3360,"configurable":false}');
  end if;
end $$;

commit;

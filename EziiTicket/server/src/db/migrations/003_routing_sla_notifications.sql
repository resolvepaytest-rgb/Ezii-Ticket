begin;

create table if not exists routing_rules (
  id bigint generated always as identity primary key,
  organisation_id bigint not null references organisations(id) on delete cascade,
  name text not null,
  priority_order int not null default 100,
  is_active boolean not null default true,
  conditions_json text,
  actions_json text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists routing_rules_org_order_idx
  on routing_rules (organisation_id, priority_order, id);

create table if not exists sla_policies (
  id bigint generated always as identity primary key,
  organisation_id bigint not null references organisations(id) on delete cascade,
  name text not null,
  tier text not null default 'tier1',
  priority text not null default 'P3',
  first_response_mins int not null,
  resolution_mins int not null,
  warning_percent int not null default 75,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sla_policies_org_idx
  on sla_policies (organisation_id, tier, priority, id);

create table if not exists notification_templates (
  id bigint generated always as identity primary key,
  organisation_id bigint not null references organisations(id) on delete cascade,
  event_key text not null,
  channel text not null default 'email',
  template_name text not null,
  subject text,
  body text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, event_key, channel)
);

create index if not exists notification_templates_org_idx
  on notification_templates (organisation_id, event_key, channel, id);

commit;


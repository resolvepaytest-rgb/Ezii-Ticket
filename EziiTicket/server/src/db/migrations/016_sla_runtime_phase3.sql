begin;

-- Phase 3: SLA runtime state + automation audit tables.

create table if not exists ticket_sla_instances (
  ticket_id bigint primary key references tickets(id) on delete cascade,
  organisation_id bigint not null references organisations(id) on delete cascade,
  priority text not null check (priority in ('P1', 'P2', 'P3', 'P4')),
  first_response_due_at timestamptz,
  resolution_due_at timestamptz,
  first_response_warned_at timestamptz,
  resolution_warned_at timestamptz,
  first_response_breached_at timestamptz,
  resolution_breached_at timestamptz,
  paused_total_seconds bigint not null default 0 check (paused_total_seconds >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ticket_sla_instances_org_idx
  on ticket_sla_instances (organisation_id, resolution_due_at);

create table if not exists ticket_sla_pauses (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references tickets(id) on delete cascade,
  organisation_id bigint not null references organisations(id) on delete cascade,
  pause_started_at timestamptz not null default now(),
  pause_ended_at timestamptz,
  reason text not null default 'pending_status',
  created_at timestamptz not null default now()
);

create index if not exists ticket_sla_pauses_ticket_idx
  on ticket_sla_pauses (ticket_id, pause_started_at desc);

create table if not exists sla_alerts_sent (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references tickets(id) on delete cascade,
  organisation_id bigint not null references organisations(id) on delete cascade,
  alert_type text not null,
  sent_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb
);

create unique index if not exists sla_alerts_sent_unique_once
  on sla_alerts_sent (ticket_id, alert_type);

commit;


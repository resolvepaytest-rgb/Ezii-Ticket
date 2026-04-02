begin;

-- Phase 2: workflow/state tracking + gate checks.
-- Additive and safe for existing Phase 1 data.

create table if not exists workflow_sequences (
  id bigint generated always as identity primary key,
  organisation_id bigint not null references organisations(id) on delete cascade,
  name text not null,
  product_id bigint references products(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, name)
);

create table if not exists workflow_steps (
  id bigint generated always as identity primary key,
  sequence_id bigint not null references workflow_sequences(id) on delete cascade,
  step_order int not null check (step_order > 0),
  team_id bigint references teams(id) on delete set null,
  queue_id bigint references queues(id) on delete set null,
  gate_type text,
  gate_config_json jsonb not null default '{}'::jsonb,
  is_auto_advance boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sequence_id, step_order)
);

create index if not exists workflow_steps_sequence_idx
  on workflow_steps (sequence_id, step_order);

create table if not exists ticket_workflow_state (
  ticket_id bigint primary key references tickets(id) on delete cascade,
  organisation_id bigint not null references organisations(id) on delete cascade,
  sequence_id bigint references workflow_sequences(id) on delete set null,
  current_step_order int,
  escalated_count int not null default 0 check (escalated_count >= 0),
  last_escalated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ticket_workflow_state_org_idx
  on ticket_workflow_state (organisation_id, sequence_id);

create table if not exists ticket_stage_gate_results (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references tickets(id) on delete cascade,
  organisation_id bigint not null references organisations(id) on delete cascade,
  gate_type text not null,
  passed boolean not null,
  actor_user_id bigint,
  details_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ticket_stage_gate_results_ticket_idx
  on ticket_stage_gate_results (ticket_id, created_at asc);

commit;


begin;

-- Phase 1 ticket domain foundation.
-- Seed-safe / rollout notes:
-- - Only additive DDL (`create table/index if not exists`) is used.
-- - No destructive changes or data rewrites in this migration.
-- - If these parent tables are missing, fail early before partial schema creation.
set local lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'organisations') then
    raise exception 'missing dependency table: organisations';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'products') then
    raise exception 'missing dependency table: products';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'queues') then
    raise exception 'missing dependency table: queues';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'teams') then
    raise exception 'missing dependency table: teams';
  end if;
end
$$;

create table if not exists ticket_counters (
  organisation_id bigint not null references organisations(id) on delete cascade,
  product_id bigint not null references products(id) on delete cascade,
  last_value int not null default 0 check (last_value >= 0),
  updated_at timestamptz not null default now(),
  primary key (organisation_id, product_id)
);

create table if not exists tickets (
  id bigint generated always as identity primary key,
  organisation_id bigint not null references organisations(id) on delete cascade,
  ticket_code text not null unique,
  ticket_number int not null,
  channel text not null check (channel in ('widget', 'portal', 'email')),
  reporter_user_id bigint not null,
  assignee_user_id bigint,
  product_id bigint not null references products(id) on delete restrict,
  category_id bigint references product_categories(id) on delete set null,
  subcategory_id bigint references product_subcategories(id) on delete set null,
  subject text not null check (length(trim(subject)) > 0 and length(subject) <= 200),
  description text not null check (length(trim(description)) >= 20),
  status text not null default 'new' check (status in ('new', 'open', 'pending', 'escalated', 'resolved', 'closed', 'cancelled', 'reopened')),
  priority text not null default 'P3' check (priority in ('P1', 'P2', 'P3', 'P4')),
  queue_id bigint references queues(id) on delete set null,
  team_id bigint references teams(id) on delete set null,
  first_response_due_at timestamptz,
  resolution_due_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  reopened_count int not null default 0 check (reopened_count >= 0),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, product_id, ticket_number)
);

create index if not exists tickets_org_status_idx
  on tickets (organisation_id, status, created_at desc);

create index if not exists tickets_org_reporter_idx
  on tickets (organisation_id, reporter_user_id, created_at desc);

create index if not exists tickets_org_assignee_idx
  on tickets (organisation_id, assignee_user_id, created_at desc);

create index if not exists tickets_org_product_category_idx
  on tickets (organisation_id, product_id, category_id, subcategory_id, created_at desc);

create table if not exists ticket_messages (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references tickets(id) on delete cascade,
  organisation_id bigint not null references organisations(id) on delete cascade,
  author_user_id bigint not null,
  author_type text not null check (author_type in ('customer', 'agent', 'system')),
  body text not null,
  is_internal boolean not null default false,
  attachments_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ticket_messages_ticket_idx
  on ticket_messages (ticket_id, created_at asc);

create table if not exists ticket_attachments (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references tickets(id) on delete cascade,
  message_id bigint references ticket_messages(id) on delete set null,
  organisation_id bigint not null references organisations(id) on delete cascade,
  uploader_user_id bigint not null,
  file_name text not null,
  file_url text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  created_at timestamptz not null default now()
);

create index if not exists ticket_attachments_ticket_idx
  on ticket_attachments (ticket_id, created_at asc);

create table if not exists ticket_events (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references tickets(id) on delete cascade,
  organisation_id bigint not null references organisations(id) on delete cascade,
  event_type text not null,
  actor_user_id bigint,
  old_values jsonb,
  new_values jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ticket_events_ticket_idx
  on ticket_events (ticket_id, created_at asc);

commit;


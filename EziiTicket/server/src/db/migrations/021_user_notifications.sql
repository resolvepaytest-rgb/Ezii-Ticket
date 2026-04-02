begin;

create table if not exists user_notifications (
  id bigint generated always as identity primary key,
  organisation_id bigint not null references organisations(id) on delete cascade,
  user_id bigint not null,
  ticket_id bigint references tickets(id) on delete set null,
  event_key text not null,
  title text not null,
  message text not null,
  navigate_url text not null,
  is_read boolean not null default false,
  created_by_user_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_notifications_org_user_created_idx
  on user_notifications (organisation_id, user_id, created_at desc);

create index if not exists user_notifications_org_user_read_created_idx
  on user_notifications (organisation_id, user_id, is_read, created_at desc);

create index if not exists user_notifications_ticket_idx
  on user_notifications (ticket_id)
  where ticket_id is not null;

commit;

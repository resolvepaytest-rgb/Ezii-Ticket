begin;

alter table roles
  add column if not exists created_at timestamptz not null default now();

commit;

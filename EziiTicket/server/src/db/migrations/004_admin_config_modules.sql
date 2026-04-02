begin;

create table if not exists canned_responses (
  id bigint generated always as identity primary key,
  organisation_id bigint not null references organisations(id) on delete cascade,
  product_id bigint references products(id) on delete set null,
  title text not null,
  body text not null,
  audience text not null default 'all',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists canned_responses_org_idx
  on canned_responses (organisation_id, product_id, is_active, id);

create table if not exists custom_fields (
  id bigint generated always as identity primary key,
  organisation_id bigint not null references organisations(id) on delete cascade,
  product_id bigint not null references products(id) on delete cascade,
  label text not null,
  field_key text not null,
  field_type text not null,
  is_required boolean not null default false,
  visibility text not null default 'agent_only',
  options_json text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, product_id, field_key)
);

create index if not exists custom_fields_org_idx
  on custom_fields (organisation_id, product_id, is_active, id);

create table if not exists api_tokens (
  id bigint generated always as identity primary key,
  organisation_id bigint not null references organisations(id) on delete cascade,
  token_name text not null,
  token_masked text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists api_tokens_org_idx
  on api_tokens (organisation_id, is_active, id);

create table if not exists webhooks (
  id bigint generated always as identity primary key,
  organisation_id bigint not null references organisations(id) on delete cascade,
  webhook_name text not null,
  endpoint text not null,
  events_json text not null default '[]',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists webhooks_org_idx
  on webhooks (organisation_id, is_active, id);

create table if not exists admin_audit_logs (
  id bigint generated always as identity primary key,
  organisation_id bigint not null references organisations(id) on delete cascade,
  module text not null,
  action text not null,
  summary text not null,
  actor_user_id bigint,
  actor_role_name text,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_org_created_idx
  on admin_audit_logs (organisation_id, created_at desc, id desc);

commit;

-- ETS: Phase-1 foundation schema (Tenant + Identity + RBAC + Teams + Product config)
-- Notes:
-- - Uses bigint identity PKs for scalability.
-- - `users.user_id` is an external identifier (from JWT) and is the preferred lookup key.

begin;

create table if not exists schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists organisations (
  id bigint generated always as identity primary key,
  name text not null,
  support_email text,
  timezone text not null default 'Asia/Kolkata',
  logo_url text,
  portal_subdomain text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organisation_settings (
  id bigint generated always as identity primary key,
  organisation_id bigint not null references organisations(id) on delete cascade,
  business_hours_definition text,
  holiday_calendar text,
  is_ngo boolean not null default false,
  ticket_retention_months int not null default 36,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id)
);

create table if not exists data_retention_policy (
  id bigint generated always as identity primary key,
  organisation_id bigint not null references organisations(id) on delete cascade,
  closed_ticket_retention_months int not null default 36,
  audit_log_retention_months int not null default 24,
  pii_masking_rules text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id)
);

create table if not exists products (
  id bigint generated always as identity primary key,
  name text not null,
  code text not null unique,
  default_ticket_prefix text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists teams (
  id bigint generated always as identity primary key,
  name text not null,
  product_id bigint references products(id) on delete set null,
  tier text,
  organisation_id bigint not null references organisations(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id bigint generated always as identity primary key,
  -- External id from JWT (preferred lookup key)
  user_id bigint not null,
  organisation_id bigint not null references organisations(id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  user_type text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  unique (organisation_id, email)
);

create table if not exists roles (
  id bigint generated always as identity primary key,
  name text not null unique,
  description text
);

create table if not exists user_roles (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(user_id) on delete cascade,
  role_id bigint not null references roles(id) on delete cascade,
  scope_organisation_id bigint references organisations(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Uniqueness rules:
-- - Only one "global" role assignment (scope_organisation_id IS NULL) per (user_id, role_id)
-- - Only one scoped role assignment per (user_id, role_id, scope_organisation_id)
create unique index if not exists user_roles_unique_global
  on user_roles (user_id, role_id)
  where scope_organisation_id is null;

create unique index if not exists user_roles_unique_scoped
  on user_roles (user_id, role_id, scope_organisation_id)
  where scope_organisation_id is not null;

create table if not exists team_members (
  id bigint generated always as identity primary key,
  team_id bigint not null references teams(id) on delete cascade,
  user_id bigint not null references users(user_id) on delete cascade,
  is_team_lead boolean not null default false,
  max_open_tickets_cap int,
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create table if not exists queues (
  id bigint generated always as identity primary key,
  name text not null,
  product_id bigint references products(id) on delete set null,
  team_id bigint references teams(id) on delete set null,
  organisation_id bigint not null references organisations(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, name)
);

create table if not exists organisation_products (
  id bigint generated always as identity primary key,
  organisation_id bigint not null references organisations(id) on delete cascade,
  product_id bigint not null references products(id) on delete cascade,
  default_routing_queue_id bigint references queues(id) on delete set null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, product_id)
);

commit;


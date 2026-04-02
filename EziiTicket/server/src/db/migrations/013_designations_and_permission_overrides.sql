begin;

create table if not exists designations (
  id bigint generated always as identity primary key,
  organisation_id bigint not null references organisations(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists designations_org_code_unique
  on designations (organisation_id, lower(trim(code)));

create unique index if not exists designations_org_name_unique
  on designations (organisation_id, lower(trim(name)));

create table if not exists user_designations (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(user_id) on delete cascade,
  designation_id bigint not null references designations(id) on delete cascade,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_designations_user_active_idx
  on user_designations (user_id, is_active);

create table if not exists user_permission_overrides (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(user_id) on delete cascade,
  organisation_id bigint not null references organisations(id) on delete cascade,
  permission_key text not null,
  effect text not null check (effect in ('allow', 'deny')),
  reason text,
  expires_at timestamptz,
  created_by bigint,
  created_at timestamptz not null default now()
);

create index if not exists user_permission_overrides_user_org_idx
  on user_permission_overrides (user_id, organisation_id);

commit;

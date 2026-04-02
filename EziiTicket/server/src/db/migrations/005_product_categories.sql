begin;

-- Categories and sub-categories per organisation + product (ticket taxonomy; admin-managed)

create table if not exists product_categories (
  id bigint generated always as identity primary key,
  organisation_id bigint not null references organisations(id) on delete cascade,
  product_id bigint not null references products(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_categories_org_product_idx
  on product_categories (organisation_id, product_id, is_active, sort_order, id);

create table if not exists product_subcategories (
  id bigint generated always as identity primary key,
  category_id bigint not null references product_categories(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_subcategories_category_idx
  on product_subcategories (category_id, is_active, sort_order, id);

commit;

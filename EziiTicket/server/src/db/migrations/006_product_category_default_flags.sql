begin;

alter table if exists product_categories
  add column if not exists is_system_default boolean not null default true;

alter table if exists product_subcategories
  add column if not exists is_system_default boolean not null default true;

commit;

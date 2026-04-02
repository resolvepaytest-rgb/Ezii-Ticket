begin;

alter table teams
  drop column if exists tier;

commit;

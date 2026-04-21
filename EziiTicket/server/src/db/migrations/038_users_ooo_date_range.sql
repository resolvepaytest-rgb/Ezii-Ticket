begin;

alter table users
  add column if not exists ooo_start_date date,
  add column if not exists ooo_end_date date;

comment on column users.ooo_start_date is 'Inclusive start date for scheduled out-of-office.';
comment on column users.ooo_end_date is 'Inclusive end date for scheduled out-of-office.';

commit;

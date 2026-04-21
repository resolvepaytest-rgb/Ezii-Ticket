begin;

alter table roles
  alter column apply_worker_type_id type text using
    case
      when apply_worker_type_id is null then null
      else apply_worker_type_id::text
    end;

comment on column roles.apply_worker_type_id is
  'Optional worker type filter ids (csv text) for role ticket scope';

commit;

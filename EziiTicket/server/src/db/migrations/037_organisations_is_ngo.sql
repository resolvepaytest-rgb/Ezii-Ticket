begin;

alter table organisations add column if not exists is_ngo boolean not null default false;

update organisations o
set is_ngo = coalesce(s.is_ngo, false)
from organisation_settings s
where s.organisation_id = o.id;

commit;

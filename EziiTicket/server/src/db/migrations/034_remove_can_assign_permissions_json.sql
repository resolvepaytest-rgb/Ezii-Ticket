begin;

update roles r
set permissions_json = coalesce(r.permissions_json, '{}'::jsonb) - 'can_assign'
where coalesce(r.permissions_json, '{}'::jsonb) ? 'can_assign';

commit;

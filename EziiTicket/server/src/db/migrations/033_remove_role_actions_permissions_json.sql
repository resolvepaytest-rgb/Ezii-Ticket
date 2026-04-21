begin;

update roles r
set permissions_json = coalesce(r.permissions_json, '{}'::jsonb) - 'actions'
where coalesce(r.permissions_json, '{}'::jsonb) ? 'actions';

commit;

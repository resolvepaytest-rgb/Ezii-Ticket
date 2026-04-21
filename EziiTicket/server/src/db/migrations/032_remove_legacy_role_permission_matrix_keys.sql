begin;

update roles r
set permissions_json =
  coalesce(r.permissions_json, '{}'::jsonb)
    - 'ticket_access'
    - 'assign_scope'
    - 'can_resolve'
    - 'tier1_sla_config'
    - 'tier2_sla_config'
where coalesce(r.permissions_json, '{}'::jsonb) ?| array[
  'ticket_access',
  'assign_scope',
  'can_resolve',
  'tier1_sla_config',
  'tier2_sla_config'
];

commit;

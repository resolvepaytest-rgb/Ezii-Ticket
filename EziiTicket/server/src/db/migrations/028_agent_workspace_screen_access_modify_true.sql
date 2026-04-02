begin;

-- Team/Agent workspace screens: view + modify on for agent / team-lead template roles (follow-up to 027).

update roles r
set permissions_json = jsonb_set(
  coalesce(r.permissions_json, '{}'::jsonb),
  '{screen_access}',
  coalesce(r.permissions_json->'screen_access', '{}'::jsonb) || jsonb_build_object(
    'agent_dashboard', jsonb_build_object('view', true, 'modify', true),
    'agent_my_tickets', jsonb_build_object('view', true, 'modify', true),
    'agent_team_queue', jsonb_build_object('view', true, 'modify', true),
    'agent_history', jsonb_build_object('view', true, 'modify', true),
    'agent_reports', jsonb_build_object('view', true, 'modify', true)
  ),
  true
)
where lower(replace(trim(r.name), ' ', '_')) in (
  'l1_agent',
  'l2_specialist',
  'l3_engineer',
  'team_lead'
);

commit;

begin;

-- Split screen access: Priority Master and Keyword trigger (keyword_routing) are separate from Routing Rules.
-- When missing, inherit view/modify from legacy `routing_rules` so existing roles keep behavior.
update roles
set permissions_json = jsonb_set(
  coalesce(permissions_json, '{}'::jsonb),
  '{screen_access}',
  coalesce(permissions_json->'screen_access', '{}'::jsonb)
    || jsonb_build_object(
      'priority_master',
      coalesce(
        permissions_json#>'{screen_access,priority_master}',
        permissions_json#>'{screen_access,routing_rules}',
        '{"view": false, "modify": false}'::jsonb
      ),
      'keyword_routing',
      coalesce(
        permissions_json#>'{screen_access,keyword_routing}',
        permissions_json#>'{screen_access,routing_rules}',
        '{"view": false, "modify": false}'::jsonb
      )
    )
);

commit;

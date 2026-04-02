begin;

alter table roles
  add column if not exists permissions_json jsonb not null default '{}'::jsonb,
  add column if not exists is_default boolean not null default false;

-- Seed default role permission matrix (data-only; authorization does not use this yet).
update roles
set is_default = true,
    permissions_json = '{
      "ticket_access": "own_tickets",
      "assign_scope": "none",
      "can_assign": false,
      "can_resolve": false,
      "tier1_sla_config": "none",
      "tier2_sla_config": "none"
    }'::jsonb
where name = 'customer';

update roles
set is_default = true,
    permissions_json = '{
      "ticket_access": "org_tickets",
      "assign_scope": "none",
      "can_assign": false,
      "can_resolve": false,
      "tier1_sla_config": "none",
      "tier2_sla_config": "none"
    }'::jsonb
where name = 'org_admin';

update roles
set is_default = true,
    permissions_json = '{
      "ticket_access": "assigned_queue",
      "assign_scope": "self",
      "can_assign": true,
      "can_resolve": true,
      "tier1_sla_config": "none",
      "tier2_sla_config": "none"
    }'::jsonb
where name = 'l1_agent';

update roles
set is_default = true,
    permissions_json = '{
      "ticket_access": "product_queue_escalated",
      "assign_scope": "l2_queue",
      "can_assign": true,
      "can_resolve": true,
      "tier1_sla_config": "none",
      "tier2_sla_config": "none"
    }'::jsonb
where name = 'l2_specialist';

update roles
set is_default = true,
    permissions_json = '{
      "ticket_access": "all_tickets",
      "assign_scope": "any",
      "can_assign": true,
      "can_resolve": true,
      "tier1_sla_config": "none",
      "tier2_sla_config": "none"
    }'::jsonb
where name = 'l3_engineer';

update roles
set is_default = true,
    permissions_json = '{
      "ticket_access": "all_tickets",
      "assign_scope": "any",
      "can_assign": true,
      "can_resolve": true,
      "tier1_sla_config": "view",
      "tier2_sla_config": "view"
    }'::jsonb
where name = 'team_lead';

update roles
set is_default = true,
    permissions_json = '{
      "ticket_access": "all_tickets",
      "assign_scope": "any",
      "can_assign": true,
      "can_resolve": true,
      "tier1_sla_config": "edit",
      "tier2_sla_config": "edit"
    }'::jsonb
where name = 'system_admin';

commit;


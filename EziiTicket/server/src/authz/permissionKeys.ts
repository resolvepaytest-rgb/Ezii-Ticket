export const SCREEN_KEYS = [
  "dashboard",
  "agent",
  "tickets",
  "users",
  "roles_permissions",
  "teams_queues",
  "routing_rules",
  "priority_master",
  "keyword_routing",
  "sla_policies",
  "notification_templates",
  "canned_responses",
  "custom_fields",
  "api_tokens",
  "webhooks",
  "audit_logs",
  /** Agent shell — Roles UI group “Team/Agent”. */
  "agent_dashboard",
  "agent_my_tickets",
  "agent_team_queue",
  "agent_history",
  "agent_reports",
  "customer_dashboard",
  "my_tickets",
  "raise_a_ticket",
  "guides",
] as const;

export type ScreenKey = (typeof SCREEN_KEYS)[number];

/**
 * Phase 1 action key registry.
 * Keep snake_case sections and dot-delimited segments stable.
 */
export const ACTION_KEYS = [
  "tickets.list",
  "tickets.list_my",
  "tickets.read",
  "tickets.create",
  "tickets.reply",
  "tickets.internal_notes.read",
  "tickets.attach",
  "tickets.attach_download",
  "tickets.status_change",
  "tickets.escalate",
  "tickets.request_escalation",
  "tickets.reopen",
  "tickets.assign",
  "notifications.read",
  "notifications.mark_read",
  "roles.read",
  "roles.manage",
  "users.read",
  "users.manage",
  "routing_rules.manage",
  "priority_master.manage",
  "keyword_routing.manage",
  "sla.policies.manage",
  "notification_templates.manage",
  "canned_responses.manage",
  "custom_fields.manage",
  "api_tokens.manage",
  "webhooks.manage",
  "audit_logs.read",
] as const;

export type ActionKey = (typeof ACTION_KEYS)[number];


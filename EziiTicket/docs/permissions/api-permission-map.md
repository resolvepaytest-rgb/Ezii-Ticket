# API Permission Map

This document maps backend endpoints to required permission keys.

- Source routes:
  - `server/src/routes/auth.routes.ts`
  - `server/src/routes/tickets.routes.ts`
  - `server/src/routes/admin.routes.ts`
- Goal: replace role-name-based checks with centralized permission checks.

---

## Permission key conventions

- Screen keys: `screens.<screen_key>.view|modify`
- Action keys: `actions.<resource>.<verb>`
- Data scope: `data_scope.<resource>`

Examples:

- `screens.tickets.view`
- `actions.tickets.assign`
- `data_scope.tickets = own|org|assigned_queue|product_queue_escalated|all`

---

## Auth endpoints

| Endpoint | Method | Current Guard | Target Permission |
| --- | --- | --- | --- |
| `/auth/login/:token` | GET | Public token validation | Public |
| `/auth/me` | GET | `requireAuth` | Authenticated user |
| `/auth/me/permissions` | GET | `requireAuth` | Authenticated user |

---

## Notifications endpoints

| Endpoint | Method | Current Guard | Target Permission |
| --- | --- | --- | --- |
| `/notifications` | GET | `requireAuth` | `actions.notifications.read` |
| `/notifications/read-all` | POST | `requireAuth` | `actions.notifications.mark_read` |
| `/notifications/:id/read` | POST | `requireAuth` | `actions.notifications.mark_read` |

---

## Ticket form metadata

| Endpoint | Method | Current Guard | Target Permission |
| --- | --- | --- | --- |
| `/tickets/form/products` | GET | `requireAuth` | `screens.raise_a_ticket.view` or `actions.tickets.create` |
| `/tickets/form/products/:productId/categories` | GET | `requireAuth` | `screens.raise_a_ticket.view` or `actions.tickets.create` |

---

## Ticket endpoints

| Endpoint | Method | Current Guard | Target Permission |
| --- | --- | --- | --- |
| `/tickets` | GET | `requireAuth` + controller role gate | `screens.tickets.view` + `actions.tickets.list` + `data_scope.tickets` |
| `/tickets` | POST | `requireAuth` | `actions.tickets.create` |
| `/tickets/my` | GET | `requireAuth` | `screens.my_tickets.view` or `screens.tickets.view` + `actions.tickets.list_my` |
| `/tickets/:id` | GET | `requireAuth` + controller role checks | `actions.tickets.read` + `data_scope.tickets` |
| `/tickets/:id/messages` | POST | `requireAuth` | `actions.tickets.reply` + `data_scope.tickets` |
| `/tickets/:id/attachments` | POST | `requireAuth` + upload middleware | `actions.tickets.attach` + `data_scope.tickets` |
| `/tickets/:ticketId/attachments/:attachmentId/download` | GET | `requireAuth` | `actions.tickets.attach_download` + `data_scope.tickets` |
| `/tickets/:id/status` | POST | `requireAuth` | `actions.tickets.status_change` + `data_scope.tickets` |
| `/tickets/:id/escalate` | POST | `requireAuth` | `actions.tickets.escalate` + `data_scope.tickets` |
| `/tickets/:id/request-escalation` | POST | `requireAuth` | `actions.tickets.request_escalation` + `data_scope.tickets` |
| `/tickets/:id/reopen` | POST | `requireAuth` | `actions.tickets.reopen` + `data_scope.tickets` |
| `/tickets/:id/assign` | POST | `requireAuth` | `actions.tickets.assign` + `data_scope.tickets` + assign scope policy |

Assign scope policy mapping:

- `assign_scope = none` -> deny
- `assign_scope = self` -> assign to self only
- `assign_scope = l2_queue` -> assign only to allowed queue/tier
- `assign_scope = any` -> unrestricted within org/scope

---

## Admin dashboard endpoints

| Endpoint | Method | Current Guard | Target Permission |
| --- | --- | --- | --- |
| `/admin/dashboard/my-assigned-tickets` | GET | `requireAuth` | `screens.dashboard.view` + `actions.dashboard.my_assigned.read` |
| `/admin/dashboard/my-sla-risk` | GET | `requireAuth` | `screens.dashboard.view` + `actions.dashboard.sla_risk.read` |
| `/admin/dashboard/team-queue-load` | GET | `requireAuth` | `screens.dashboard.view` + `actions.dashboard.team_queue_load.read` |

---

## Roles and org-support-level endpoints

| Endpoint Pattern | Method(s) | Current Guard | Target Permission |
| --- | --- | --- | --- |
| `/admin/roles` | GET/POST | `rolesEditorOnly` | `screens.roles_permissions.view|modify` + `actions.roles.read|manage` |
| `/admin/roles/:id` | PUT/DELETE | `rolesEditorOnly` | `screens.roles_permissions.modify` + `actions.roles.manage` |
| `/admin/designations*` | GET/POST/PUT/DELETE | `rolesEditorOnly` | `screens.roles_permissions.view|modify` + `actions.org_support_levels.manage` |
| `/admin/org-support-levels*` | GET/POST/PUT/DELETE | `rolesEditorOnly` | `screens.roles_permissions.view|modify` + `actions.org_support_levels.manage` |

---

## User and user-role management endpoints

| Endpoint Pattern | Method(s) | Current Guard | Target Permission |
| --- | --- | --- | --- |
| `/admin/users` | GET/POST | `adminOnly` | `screens.users.view|modify` + `actions.users.read|manage` |
| `/admin/users/:user_id` | GET/PUT | `adminOnly` | `screens.users.view|modify` + `actions.users.read|manage` |
| `/admin/users/:user_id/roles` | GET/PUT | `adminOnly` | `screens.users.modify` + `actions.users.roles.assign` |
| `/admin/users/:user_id/designation` | GET/PUT | `adminOnly` | `screens.users.modify` + `actions.users.support_level.assign` |
| `/admin/users/:user_id/permission-overrides` | GET/PUT | `adminOnly` | `screens.roles_permissions.modify` + `actions.permissions.overrides.manage` |
| `/admin/user-scope-org` and delete scope | GET/DELETE | `adminOnly` | `screens.users.modify` + `actions.users.scope_org.manage` |
| `/admin/organisations/:id/user-directory` | GET | `adminOnly` | `screens.users.view` + `actions.users.directory.read` |
| `/admin/organisations/:id/invited-agent-users` | GET | `adminOnly` | `screens.users.view` + `actions.users.directory.read` |
| `/admin/organisations/:id/provision-customer-users` | POST | `adminOnly` | `screens.users.modify` + `actions.users.provision` |
| `/admin/users/:user_id/org-support-level` | GET/PUT | `adminOnly` | `screens.users.modify` + `actions.users.support_level.assign` |

---

## Organisation and product configuration endpoints

| Endpoint Pattern | Method(s) | Current Guard | Target Permission |
| --- | --- | --- | --- |
| `/admin/organisations` | GET/POST | `adminOnly` | `screens.users.view|modify` + `actions.organisations.read|manage` |
| `/admin/organisations/:id` | GET/PUT | `adminOnly` | `actions.organisations.read|manage` |
| `/admin/organisations/:id/settings` | GET/PUT | `adminOnly` | `actions.organisations.settings.read|manage` |
| `/admin/organisations/:id/retention` | GET/PUT | `adminOnly` | `actions.organisations.retention.read|manage` |
| `/admin/products` | GET | `adminOnly` | `actions.products.read` |
| `/admin/organisations/:id/products` | GET | `adminOnly` | `actions.organisations.products.read` |
| `/admin/organisations/:id/products/:product_id` | PUT | `adminOnly` | `actions.organisations.products.manage` |
| `/admin/organisations/:id/sla-tier1-bounds` | GET/PUT | `adminOnly` | `screens.sla_policies.view|modify` + `actions.sla.tier1_bounds.read|manage` |

---

## Teams and queues endpoints

| Endpoint Pattern | Method(s) | Current Guard | Target Permission |
| --- | --- | --- | --- |
| `/admin/teams*` | GET/POST/PUT/DELETE | `adminOnly` | `screens.teams_queues.view|modify` + `actions.teams.manage` |
| `/admin/teams/:id/members` | GET/PUT | `adminOnly` | `screens.teams_queues.modify` + `actions.teams.members.manage` |
| `/admin/queues*` | GET/POST/PUT/DELETE | `adminOnly` | `screens.teams_queues.view|modify` + `actions.queues.manage` |
| `/admin/agents/ticket-metrics` | GET | `adminOnly` | `screens.dashboard.view` + `actions.agents.metrics.read` |

---

## Routing, priority, keyword, SLA, templates

| Endpoint Pattern | Method(s) | Current Guard | Target Permission |
| --- | --- | --- | --- |
| `/admin/routing-rules*` | GET/POST/PUT/DELETE | `adminOnly` | `screens.routing_rules.view|modify` + `actions.routing_rules.manage` |
| `/admin/priority-master` | GET/PUT | `adminOnly` | `screens.priority_master.view|modify` + `actions.priority_master.manage` |
| `/admin/keyword-routing*` | GET/POST/PUT/DELETE | `adminOnly` | `screens.keyword_routing.view|modify` + `actions.keyword_routing.manage` |
| `/admin/sla-policies*` | GET/POST/PUT/DELETE | `adminOnly` | `screens.sla_policies.view|modify` + `actions.sla.policies.manage` |
| `/admin/notification-templates*` | GET/POST/PUT/DELETE | `adminOnly` | `screens.notification_templates.view|modify` + `actions.notification_templates.manage` |

---

## Product categories

| Endpoint Pattern | Method(s) | Current Guard | Target Permission |
| --- | --- | --- | --- |
| `/admin/organisations/:organisation_id/products/:product_id/categories` | GET/POST | `adminOnly` | `screens.custom_fields.view|modify` + `actions.product_categories.manage` |
| `/admin/product-categories/:id` | PUT/DELETE | `adminOnly` | `actions.product_categories.manage` |
| `/admin/product-categories/:categoryId/subcategories` | POST | `adminOnly` | `actions.product_categories.manage` |
| `/admin/product-subcategories/:id` | PUT/DELETE | `adminOnly` | `actions.product_categories.manage` |

---

## Canned responses, custom fields, API tokens, webhooks, audit logs

| Endpoint Pattern | Method(s) | Current Guard | Target Permission |
| --- | --- | --- | --- |
| `/admin/canned-responses*` | GET/POST/PUT/DELETE | `adminOnly` | `screens.canned_responses.view|modify` + `actions.canned_responses.manage` |
| `/admin/custom-fields*` | GET/POST/PUT/DELETE | `adminOnly` | `screens.custom_fields.view|modify` + `actions.custom_fields.manage` |
| `/admin/api-tokens*` | GET/POST/PUT | `adminOnly` | `screens.api_tokens.view|modify` + `actions.api_tokens.manage` |
| `/admin/webhooks*` | GET/POST/PUT/DELETE | `adminOnly` | `screens.webhooks.view|modify` + `actions.webhooks.manage` |
| `/admin/audit-logs` | GET | `adminOnly` | `screens.audit_logs.view` + `actions.audit_logs.read` |

---

## System-wide admin endpoints

| Endpoint Pattern | Method | Current Guard | Target Permission |
| --- | --- | --- | --- |
| `/admin/system/tickets/filter-options` | GET | `requireAuth` (controller enforces elevated) | `actions.system.tickets.read` + `data_scope.system = all_orgs` |
| `/admin/system/tickets` | GET | `requireAuth` (controller enforces elevated) | `actions.system.tickets.read` + `data_scope.system = all_orgs` |
| `/admin/system/organisations/ticket-metrics` | GET | `requireAuth` (controller enforces elevated) | `actions.system.metrics.read` + `data_scope.system = all_orgs` |

---

## Migration notes

1. Add centralized policy helper and call from every controller.
2. Keep existing `requireAuth`; reduce `requireRole(...)` usage over time.
3. First migrate tickets and role-management endpoints.
4. Add endpoint-level tests for allow and deny cases by permission key.

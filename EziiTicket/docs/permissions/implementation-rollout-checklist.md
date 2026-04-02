# Permission System Rollout Checklist

Use this checklist to move from mixed role-name checks to centralized permission-based authorization.

## Phase 1: Contract and key registry

- [x] Define canonical permission schema (`screens`, `actions`, `data_scope`, `sla`)
- [x] Create shared key registry for all screen and action keys
- [x] Freeze naming conventions (`snake_case` for keys)
- [x] Document role templates and org override rules

### Phase 1 progress notes

- Added server registry: `server/src/authz/permissionKeys.ts`
- Added server schema/types: `server/src/authz/permissionSchema.ts`
- Wired server usage in:
  - `server/src/controllers/auth/mePermissions.controller.ts`
  - `server/src/services/provisioning/ensureTenantAndDefaults.ts`
- Added client-side registry mirror: `client/src/config/permissionKeys.ts`
- Added naming validator: `server/src/authz/permissionNaming.ts`
- Added startup enforcement: `server/src/app.ts`
- Added template/override policy doc: `docs/permissions/role-templates-and-overrides.md`

## Phase 2: Backend authorization centralization

- [x] Implement policy service (`canViewScreen`, `canModifyScreen`, `canDo`, `buildScope`)
- [x] Replace role-name checks in ticket controllers with policy calls
- [x] Enforce data scope in list/get/update/delete APIs
- [x] Add deny-by-default for unknown actions
- [x] Add permission-denied audit logs

### Phase 2 progress notes (minimal safe slice)

- Added policy helper: `server/src/authz/policy.ts`
- Integrated policy checks (with legacy fallback) in:
  - `listTickets` (`tickets.list` + `screens.tickets.view`)
  - `getTicketById` (`tickets.read`)
- Added centralized ticket scope predicate in policy:
  - `buildTicketScopePredicate(policy)`
- Wired `listTickets` row filtering to policy scope predicate.
- Wired `getTicketById` row authorization to policy scope predicate (list/detail alignment).
- Wired `addTicketMessage` and `changeTicketStatus` authorization to policy action + scope predicate.
- Wired `assignTicket` and `escalateTicket` authorization to policy action + scope predicate.
- Wired `requestCustomerEscalation` authorization to policy action + scope predicate.
- Added action-aware reopen authorization path (`tickets.reopen`) via `changeTicketStatus`.
- Added permission-denied audit helper: `server/src/authz/denyAudit.ts` and wired deny logging on migrated ticket endpoints.
- Added strict action mode flag: `PERMISSION_STRICT_ACTIONS` (`server/src/config/env.ts`) to disable legacy action fallback when enabled.
- Migrated `listMyTickets` to policy-based access (`tickets.list_my`) + centralized scope predicate.
- Replaced internal-note visibility role heuristic in `getTicketById` with policy action (`tickets.internal_notes.read`).
- Added `canModifyScreen` to policy helper surface and reduced role dependency in message author/internal handling.
- Removed remaining role-name fallback gates in migrated ticket endpoints (`listTickets`, `assignTicket`, `escalateTicket`); policy actions now required.

## Phase 3: Frontend alignment

- [x] Read effective permissions from `/auth/me/permissions`
- [x] Drive sidebar and route access from `screens.*`
- [x] Drive button/action visibility from `actions.*`
- [x] Remove hardcoded role assumptions from UI flows
- [x] Ensure modify implies view in runtime normalization

### Phase 3 progress notes (safe first slice)

- Frontend now reads and normalizes `permissions_json.actions` from `/auth/me/permissions` in `client/src/App.tsx`.
- Added action-access types in:
  - `client/src/api/authApi.ts`
  - `client/src/config/permissionKeys.ts`
- Replaced one role-based UI gate with action-based gate (with safe role fallback):
  - Sidebar create-ticket button now checks `tickets.create`.
- `MyTicketsPage` action controls now use `actions.*` checks (with safe fallback):
  - `tickets.reply`
  - `tickets.status_change`
  - `tickets.escalate`
  - `tickets.reopen`
  - `tickets.request_escalation`
  - `tickets.internal_notes.read`
- `App.tsx` ticket route/render guards now use action checks (with safe fallback):
  - `tickets.list`
  - `tickets.list_my`
  - `tickets.create`
- `App.tsx` org-admin route guards partially moved from role-only checks to action checks (safe fallback):
  - `products.read` (Products route)
  - `users.read` (Users & Roles route)
  - `sla.policies.manage` (Org SLA Policies route)
- Dashboard navigation callbacks are now action-aware (safe fallback):
  - `onNavigateToTickets` uses `tickets.list` / `tickets.list_my`
  - `onNavigateToCreateTicket` uses `tickets.create`
- Create-ticket post-create redirect is now action-aware (safe fallback):
  - `CreateTicketDrawer.onCreated` uses `tickets.list` / `tickets.list_my` / `tickets.create`
- Raised-ticket page post-create redirect now uses the same action-aware destination logic:
  - `RaiseTicketPage.onCreated` aligned with `CreateTicketDrawer.onCreated`
- Legacy nav alias remap now uses action-aware destination logic:
  - `workspace_module_a` remap is driven by `tickets.list` / `tickets.list_my` / `tickets.create` (safe fallback retained)
- Legacy SLA alias remap is now permission-driven for all roles:
  - `workspace_sla_configuration` resolves to `org_sla_policies` only when `sla.policies.manage` is allowed, otherwise `workspace_overview`
- Legacy `workspace_module_b` alias remap is now role-agnostic:
  - `workspace_module_b` always normalizes to `workspace_overview` (prevents dead-nav persistence without role-branch logic)
- Team dashboard callbacks now use permission/screen signals instead of role branches:
  - `onNavigateToTickets` uses `tickets.list`/`tickets.list_my` and customer-ticket screen visibility to select target
  - `onNavigateToCreateTicket` is gated by `tickets.create` (no customer-only role branch)
- Sidebar system-ticket pruning for non-system users is now capability-driven:
  - replaced `agent/team_lead` role gate with `!tickets.list && tickets.list_my` logic (team-view mode only)
- Dashboard toggle + mode selection are now capability-driven:
  - toggle eligibility uses customer screen access or `!tickets.list && tickets.list_my` capability pattern
  - forced team view uses system-admin shell or `tickets.list` capability (instead of role branch)
- Customer-nav safety redirect now uses screen-access detection (not customer role name):
  - guarded by presence of customer-scoped screen grants and `canViewCustomerNavKey(...)` checks
- Customer sidebar filtering now uses capability profile (not customer role name):
  - `isCustomerExperience` derives from customer screen grants + absence of org/team capabilities
- Reports placeholder copy now follows ticket-list capability (not org-admin role check)
- Ticket destination routing is now centralized and capability-driven:
  - notification deep-link, post-create redirects, and `workspace_module_a` remap now share one permission/screen-based resolver
- Sidebar merge behavior reduced role coupling further:
  - system-admin branch uses interface capability flag (`isSystemAdminInterface`) instead of direct role string check
  - flat-vs-grouped merge mode now follows org-admin capabilities (`products/users/sla`) instead of `roleKind !== org_admin`
- Ticket-action fallback gates are now capability-profile based (reduced role lists):
  - non-system workspace fallback uses screen/menu presence
  - team ticket-list fallback uses system-shell or non-customer capability profile
- Org route action fallbacks no longer use direct org-admin role string in `App.tsx`:
  - `products.read` / `users.read` / `sla.policies.manage` fallback now uses sidebar capability profile
- `MyTicketsPage` draft/canned-response flow now follows action capability (`tickets.reply`) instead of `isAgentLike` role heuristic
- `App.tsx` initial shell/nav bootstrap no longer branches on system-admin role string:
  - uses `isSystemAdminInterface` capability-profile flag in startup route enforcement
  - legacy alias remap now uses customer/org capability profiles (not role re-mapping branch)
- `MyTicketsPage` detail/action rendering shifted from `isAgentLike` to permission flags where safe:
  - customer/support detail blocks, timeline, escalation/reopen controls, activity density/style, composer labels/placeholders
  - send-button restrictions now branch on `canWriteInternal` instead of role heuristic
- `App.tsx` system-admin and org-admin profile detection now prioritizes permission/profile signals:
  - system-admin shell identity derives from scoped/access roles + hard identity check (not `roleKind` string only)
  - org-admin route fallback profile now derives from action capabilities with legacy sidebar fallback
- Final closure hardening:
  - `App.tsx` removed role-to-shell mapping dependency from runtime access flow; shell profile now derives from permission/capability signals
  - `MyTicketsPage` removed role-name heuristic fallback (`isAgentLike`); action visibility now fully permission-key driven

## Phase 4: Migration and defaults

- [x] Add migration for any new keys with safe defaults
- [x] Backfill role templates for all orgs
- [x] Preserve legacy key sync during transition (`dashboard`/`customer_dashboard`, `tickets`/`my_tickets`)
- [x] Add script to validate all roles contain required keys

### Phase 4 progress notes (careful first slice)

- Added migration: `server/src/db/migrations/025_permissions_phase4_backfill.sql`
  - backfills all canonical `screen_access` and `actions` keys with safe defaults
  - preserves transition sync by merging and mirroring:
    - `dashboard` <-> `customer_dashboard`
    - `tickets` <-> `my_tickets`
- Added org-wide template backfill script:
  - `server/src/scripts/backfillRolePermissionTemplates.ts`
  - uses `ensureTenantAndDefaultsByOrgId` for every organisation
- Added key validation script:
  - `server/src/scripts/validateRolePermissionKeys.ts`
  - verifies every role contains all required screen/action keys with expected boolean shapes
- Added npm scripts in `server/package.json`:
  - `permissions:backfill-templates`
  - `permissions:validate-keys`

## Phase 5: QA and security hardening

- [ ] Test each role against every protected endpoint
- [ ] Verify customer cannot access internal screens/APIs
- [ ] Verify org-boundary isolation for all ticket queries
- [ ] Verify `apply_role_to` scopes on list and detail endpoints
- [ ] Add regression tests for permission merge behavior

### Phase 5 progress notes (verification pass start)

- Added role-by-role endpoint verification script:
  - `server/src/scripts/verifyRoleEndpointChecks.ts`
  - npm script: `permissions:verify-role-endpoints`
- Ran verification after migration/backfill/validate:
  - `db:migrate`
  - `permissions:backfill-templates`
  - `permissions:validate-keys` (`ok roles=84`)
  - `permissions:verify-role-endpoints`
- Current outcome is intentionally strict and highlights a migration gap:
  - all roles report `allow=0/29` for target action/screen checks
  - this means canonical action grants are present as keys but still defaulted to `false` for all roles
  - next required slice: seed role action baselines (per role template) before Phase 5 pass/fail can be meaningful

### Phase 5 progress notes (baseline seeding increment)

- Added migration: `server/src/db/migrations/026_seed_default_role_action_baselines.sql`
  - seeds `actions` baseline for default template roles only:
    - `customer`, `org_admin`, `l1_agent`, `l2_specialist`, `l3_engineer`, `team_lead`, `system_admin`
  - safety guard: applies only to roles with zero `true` action grants (avoids overwriting customized roles)
- Re-ran:
  - `db:migrate` -> applied migration `026_seed_default_role_action_baselines`
  - `permissions:verify-role-endpoints`
- Verification now produces differentiated role outcomes (example org 1):
  - `system_admin`: `29/29`
  - `org_admin`: `28/29` (missing `tickets.assign`)
  - `team_lead`: `26/29` (missing `tickets.request_escalation`, `roles.manage`, `users.manage`)
  - `l1/l2/l3`: `14/29` (admin-management actions intentionally denied in current baseline)
  - `customer`: `11/29` (internal/admin actions denied as expected)

## Definition of done

- No controller relies on role-name string checks for authorization.
- All protected endpoints use centralized permission + data scope checks.
- Frontend and backend permission behavior matches for all standard roles.
- Audit trail records who changed permissions and who was denied access.

# ETS Ticket Flow + Implementation Roadmap

## 1) Ideal Ticket Path Flow (PRD-aligned)

### 1.1 Creation Channels
- Primary: Chat Widget (in-app, always available).
- Secondary: Self-Service Portal.
- Fallback: Email-to-ticket.
- All channels create the same ticket object; only `channel` differs for reporting.

### 1.2 Creation to Assignment
1. Customer submits ticket (`product`, `category`, optional `subcategory`, `subject`, `description`, `attachments`).
2. Ticket is created with status `new`.
3. Routing rules evaluate ticket facts (product/category/priority/keywords/affected users/time/org).
4. Matching rule chooses target queue/team/tier.
5. Auto-assignment picks least-loaded available agent in team.
6. Ticket moves to `open` and assigned agent starts work.

### 1.3 Lifecycle (State Machine)
- `new -> open`
- `open -> pending | escalated | resolved`
- `pending -> open | resolved`
- `escalated -> open | resolved`
- `resolved -> closed | reopened`
- `closed -> reopened`
- `cancelled` terminal

### 1.4 Resolve / Close
- Agent can set `resolved` only after required gates (for example resolution note minimum length).
- Customer can reopen within 7 days (`reopened`).
- If not reopened within 7 days, system auto-closes (`closed`).

## 2) How Channel, Routing Rules, Queues, Teams, SLA Work Together

1. **Channel intake** normalizes incoming payload to one ticket contract.
2. **Routing rules** decide destination (queue/team/tier/priority tags).
3. **Queue** stores unassigned work for that destination.
4. **Team** ownership defines who can claim/receive work and escalation target.
5. **Assignment engine** allocates to least-loaded eligible agent (active, not OOO, under cap).
6. **SLA policy** starts timers at create/open, pauses on pending, escalates/alerts on breach.
7. **Workflow engine** enforces valid status transitions and stage gates.
8. **Audit + notifications** fire on each transition/assignment/SLA event.

## 3) Missing in Current Implementation

## 3.1 Backend Domain Gaps
- No full ticket domain schema (`tickets`, `ticket_messages`, `ticket_events`, `ticket_assignments`, `sla_instances`).
- No status transition service enforcing state-machine rules.
- No create-ticket APIs for widget/portal/email channels.
- No resolve/reopen/auto-close job implementation.
- No assignment engine (least-loaded + team availability + max cap).
- No workflow stage-gate checks (diagnosis note, resolution note, required fields).
- No SLA runtime calculator with pause/resume/escalation actions.

## 3.2 API Gaps
- Missing customer APIs: create ticket, list my tickets, ticket detail, reply, reopen, mark resolved.
- Missing agent APIs: claim/reassign, update status, escalate with handoff payload.
- Missing system jobs/endpoints for SLA alerts, breach escalations, 7-day auto-close.

## 3.3 Frontend Gaps
- Ticket creation and lifecycle screens are largely placeholders/static.
- Widget/portal flow not wired to real ticket APIs.
- My Tickets and Ticket Detail not connected to live conversation/status timelines.

## 4) Build Order (Phase 1-4)

## Phase 1 - Ticket Core (Create -> Open)
**Goal:** working ticket creation and read paths fast.

### First migrations
- `014_ticket_core.sql`
  - `tickets`
  - `ticket_attachments`
  - `ticket_messages`
  - indexes on `(organisation_id, status)`, `(assignee_user_id)`, `(created_at)`, `(product_id, category_id)`
- `015_ticket_events.sql`
  - immutable event log for status/assignment/field updates

### First APIs
- `POST /tickets` (channel-aware create)
- `GET /tickets/my`
- `GET /tickets/:id`
- `POST /tickets/:id/messages`

### Key rules in Phase 1
- On create, set `status = new`, compute initial SLA deadlines, evaluate routing, assign, then set `open`.
- Write event entries for create, route decision, assignment, status move.

## Phase 2 - Workflow + Status Engine (Open/Pending/Escalated/Resolved/Reopened)
**Goal:** enforce state machine and team workflow integrity.

### Migrations
- `016_ticket_workflow.sql`
  - `workflow_sequences`
  - `workflow_steps`
  - `ticket_workflow_state`
  - `ticket_stage_gate_results`

### APIs
- `POST /tickets/:id/status` (single transition endpoint)
- `POST /tickets/:id/escalate`
- `POST /tickets/:id/reopen`
- `POST /tickets/:id/assign`

### Engine requirements
- Validate allowed transitions.
- Enforce gates before `resolved`.
- Preserve reopen rules (7-day window, reopen count limit, resolver reassignment priority).

## Phase 3 - SLA Runtime + Automation
**Goal:** automate alerts, escalations, and close lifecycle.

### Migrations
- `017_sla_runtime.sql`
  - `ticket_sla_instances`
  - `ticket_sla_pauses`
  - `sla_alerts_sent`

### Jobs / workers
- `sla_tick_worker` (every minute):
  - evaluate warning thresholds
  - detect breaches
  - trigger auto-escalation actions
- `auto_close_worker` (daily/hourly):
  - close resolved tickets older than 7 days without reopen

### APIs (if needed for admin observability)
- `GET /tickets/:id/sla`
- `GET /admin/sla-events`

## Phase 4 - UI Wiring + Hardening
**Goal:** production-ready UX with auditability.

### Frontend
- Implement actual customer raise-ticket flow (widget + portal same API contract).
- Implement My Tickets, Ticket Detail, Reply, Reopen, Mark Resolved actions.
- Implement agent queue, ticket detail, send-and-set-status actions.

### Hardening
- Notification templates wired to real lifecycle events.
- Metrics dashboards from real ticket/SLA tables.
- Permission checks per role/action.
- Integration tests for creation -> resolved -> closed and reopen edge cases.

## 5) Minimal Fast Path to Deliver Quickly (No Rework)
- Deliver **Phase 1 + Phase 2 (core subset)** first:
  - create ticket, assign, open/pending/resolved/reopen transitions
  - basic list/detail/messages
- Then add **Phase 3 automation** (SLA worker + auto-close).
- Keep one transition engine only (avoid scattered status updates in controllers).
- Use event log from day one to avoid future migration pain for audit/reporting.

## 6) Suggested Immediate Next Sprint Tasks
1. Add `014_ticket_core.sql` + `015_ticket_events.sql`.
2. Implement `POST /tickets`, `GET /tickets/my`, `GET /tickets/:id`.
3. Implement transition service with guardrails for `open/pending/resolved/reopened`.
4. Wire `cust_raise_ticket` and `cust_my_tickets` to live APIs.
5. Add one background worker for 7-day auto-close.


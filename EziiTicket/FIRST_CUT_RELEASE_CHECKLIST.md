# Ezii Ticketing System — First Cut Release Checklist

**Document purpose:** Ye checklist **Ezii Ticketing (EziiTicket repo)** ke current implementation ko **PRD v1.0** (`Ezii_PRD_final.md`) se compare karke dikhati hai — kitna complete hai (%), kya **First Cut** release ke scope mein maana ja sakta hai, aur **release ke baad enhancement** backlog mein kya jayega.

**Last updated:** March 29, 2026  
**Applies to:** Codebase under `EziiTicket/` (client + server)

---

## 1. Percentage ka matlab (methodology)

| Symbol | Meaning |
|--------|---------|
| **100%** | PRD jaisa behaviour end-to-end (UI + API + automation jahan zaroori) |
| **Partial** | Kaam karta hai par PRD se kam / deviation hai |
| **0%** | Implement nahi ya sirf DB/schema stub |

**Overall %** niche **weighted average** hai: har module ko **business importance** (First Cut ke liye) diya gaya hai. Ye **subjective** hai — isko sprint planning mein adjust kiya ja sakta hai.

**Suggested overall First Cut vs PRD v1.0 parity: ~60–64%** (niche table + recent ticket UX/attachments work ke baad).

---

## 2. Executive summary — module-wise completion

| # | Module / pillar | PRD weight (First Cut) | Est. % complete | Notes (ek line) |
|---|-----------------|------------------------|-----------------|-----------------|
| 1 | Repo & runtime (API, DB migrations, auth) | 10% | **~85%** | Core server + routes; env-based automation |
| 2 | Organisation & product setup | 8% | **~80%** | Orgs, products, categories; portal fields partial |
| 3 | Teams, queues, assignment (least-loaded) | 10% | **~75%** | Team/queue CRUD; cap on assign; OOO not verified |
| 4 | Routing rules + keyword routing | 12% | **~70%** | First-match rules + keywords; not all PRD actions |
| 5 | SLA policies (admin) + Tier1 bounds | 8% | **~85%** | UI + API strong |
| 6 | SLA runtime (timers, pause, breach, jobs) | 12% | **~50%** | Resolution warn/breach + pause + 7d close; Tier2/FR SLA gaps |
| 7 | Ticket lifecycle API (CRUD, status, messages, attachments) | 12% | **~82%** | Messages + internal notes + multipart upload/download; create skips `new` |
| 8 | Ticket state machine (PRD parity) | 8% | **~60%** | Transitions enforced; reopen SLA/resolver gaps |
| 9 | Sequential workflow + stage gates | 10% | **~20%** | Tables + partial gates; **no sequence engine/admin** |
| 10 | Notifications (templates vs delivery) | 5% | **~35%** | Template CRUD; ticket-triggered send unclear |
| 11 | Customer / agent UI (portal flows) | 8% | **~68%** | Raise ticket (product/category dropdowns), attachments, thread + internal notes |
| 12 | Chat widget & alternate channels | 4% | **~5%** | PRD scope largely pending |
| 13 | Reporting & dashboards | 3% | **~40%** | Some dashboard endpoints/pages |
| 14 | Audit & compliance trail | 3% | **~70%** | Admin audit + ticket events; workflow audit partial |

**Weighted approximate completion (PRD v1.0): ~62%**  
**First Cut “releasable MVP” internal readiness:** Agar goal sirf **internal pilot** (Ezii teams) hai to **routing + tickets + basic SLA + admin** ke basis par **release candidate** ban sakta hai, lekin **workflow sequences, full SLA parity, notifications, widget** ko explicitly **out of scope** mark karna chahiye.

---

## 3. Detailed checklist — PRD alignment

### 3.1 Organisation & product setup (PRD §3.1)

| ID | Requirement | Status | Evidence / gap |
|----|-------------|--------|----------------|
| O1 | Organisation profile (name, logo, timezone, support email, portal URL) | **Partial** | Core fields; full branding/subdomain UX verify |
| O2 | Business hours + holiday calendar | **Partial / gap** | PRD: SLA drives; implementation may use simple intervals |
| O3 | Product enablement per org | **Done** | `organisation_products` pattern |
| O4 | Default ticket prefix + default routing queue per product | **Partial** | Supported; verify all products seeded |

---

### 3.2 Categories & taxonomy (PRD §3.2)

| ID | Requirement | Status | Evidence / gap |
|----|-------------|--------|----------------|
| C1 | Categories/subcategories per product (admin) | **Done** | Managed in admin |
| C2 | Categories drive routing + reporting | **Partial** | Routing uses category; reporting depth varies |
| C3 | Default category trees (Payroll/Leave/Attendance/Expense) | **Partial** | Seed/defaults depend on migration/seed scripts |

---

### 3.3 SLA policy engine (PRD §3.3)

| ID | Requirement | Status | Evidence / gap |
|----|-------------|--------|----------------|
| S1 | Tier 1 SLA configurable per org within bounds | **Done** | Policies + bounds UI |
| S2 | Tier 2 internal SLA (non-customer) | **Partial** | Policies may exist; **runtime** on escalate not full PRD |
| S3 | Tier 1 cannot be stricter than Tier 2 (validation) | **Verify** | Server-side rule confirm in API |
| S4 | SLA calculation: business hours + holidays | **Gap** | Likely **calendar** elapsed time for v1 cut |
| S5 | Tier 1 starts at create; Tier 2 at escalated | **Partial** | T1 on create; T2 lifecycle **incomplete** |
| S6 | Pause SLA on Pending; resume rules | **Partial** | Pause/resume implemented; PRD edge (48h pending) **gap** |
| S7 | 75% warnings + breach handling (both tiers) | **Partial** | Resolution 75%/breach in automation; **first response** + Tier2 **gap** |
| S8 | Keyword auto-escalation (PRD §3.3.5) | **Partial** | Keyword routing → P1/L3 style path; may differ from static keyword table |

---

### 3.4 Routing & assignment (PRD §3.4)

| ID | Requirement | Status | Evidence / gap |
|----|-------------|--------|----------------|
| R1 | Rules evaluated in priority order; first match wins | **Done** | `priority_order` |
| R2 | Conditions: product, category, subcategory, priority, channel, keywords, affected users | **Done** | Matcher in controller |
| R3 | Actions: queue, team, priority override | **Done** | Implemented |
| R4 | Actions: SLA policy apply, tags, notify recipient | **Gap / partial** | Not all wired on create |
| R5 | Round-robin / least-loaded | **Partial** | **Least-loaded** implemented; round-robin N/A or partial |
| R6 | Integration with workflow sequence | **Gap** | **No sequence resolution** on create |

---

### 3.5 Workflow configuration (PRD §4)

| ID | Requirement | Status | Evidence / gap |
|----|-------------|--------|----------------|
| W1 | Sequential workflow model (L1→L2→L3 steps) | **Gap** | **No admin UI**; `sequence_id` not bound |
| W2 | Step: tier, team, gate, auto-advance | **Gap** | `workflow_steps` table exists; **no runtime** |
| W3 | Default sequences (Standard L1, L1→L2, etc.) | **Gap** | Not loaded as data-driven defaults |
| W4 | Auto-assign on step entry (least-loaded) | **Partial** | On create + manual escalate; **not step-driven** |
| W5 | Stage gates: Diagnosis note (L1→L2/L3) | **Gap** | Not enforced |
| W6 | Stage gates: Resolution notes min length | **Partial** | **50 chars** hardcoded gate |
| W7 | Stage gates: Required field, cancellation reason | **Gap** | Not configurable per step |
| W8 | SLA breach → advance workflow step | **Gap** | Breach sets **escalated**; **no step index advance** |

---

### 3.6 Ticket state machine (PRD §4.1)

| ID | Requirement | Status | Evidence / gap |
|----|-------------|--------|----------------|
| T1 | States: New, Open, Pending, Escalated, Resolved, Closed, Cancelled, Reopened | **Partial** | **Create → Open** directly (skips **New**) |
| T2 | Open vs Pending semantics + SLA | **Partial** | Pause/resume OK; agent must set Pending manually ✓ |
| T3 | Reopen: 7-day window, max 3 reopens, auto-escalate on 3rd | **Partial** | Window + count + escalate **done** |
| T4 | Reopen: assign to previous resolver | **Gap** | Not implemented |
| T5 | Reopen: SLA full restart | **Gap** | Deadlines not clearly recomputed on reopen |
| T6 | Reopen: tier returns to resolver’s tier | **Gap** | Not explicit |

---

### 3.7 SLA-triggered automation (PRD §4.4)

| ID | Requirement | Status | Evidence / gap |
|----|-------------|--------|----------------|
| A1 | 75% first response — notify agent + TL | **Gap** | Not verified in `runSlaTick` |
| A2 | First response breach — notes + notify | **Gap** | |
| A3 | 75% resolution — notify | **Partial** | Event/log style; **email** unclear |
| A4 | Resolution breach — escalate + notify org admin | **Partial** | Status **escalated**; **notifications** gap |
| A5 | Tier 2 acknowledgement SLA | **Gap** | |
| A6 | Pending > 48h — auto Open | **Gap** | |
| A7 | Resolved 7d — auto close | **Done** | `runAutoCloseTick` |

---

### 3.8 Notifications (PRD §3.6)

| ID | Requirement | Status | Evidence / gap |
|----|-------------|--------|----------------|
| N1 | Template CRUD + variables | **Done** | Admin UI |
| N2 | Delivery on ticket events (email + in-app) | **Gap** | **Wire** from ticket lifecycle to sender |

---

### 3.9 Customer & agent experience

| ID | Requirement | Status | Evidence / gap |
|----|-------------|--------|----------------|
| U1 | Self-service raise ticket (product/category UX) | **Partial → Done** | `GET /tickets/form/products` + categories; dropdowns on Raise Ticket; optional multi-file upload after create |
| U2 | My tickets + detail + thread | **Partial** | Thread + SLA fields; **internal notes** + **attachments** list/upload/download |
| U1a | Attachments on messages (per-message) | **Gap** | Files are **ticket-level** (`ticket_attachments`); not linked to `message_id` in UI yet |
| U3 | Agent queue / claim | **Partial** | Team queue listing patterns; claim flow verify |
| U4 | Chat widget | **Gap** | PRD Ch.5 — not in first cut |

---

### 3.10 API, webhooks, security, audit

| ID | Requirement | Status | Evidence / gap |
|----|-------------|--------|----------------|
| X1 | RBAC / roles | **Done** | Strong admin surface |
| X2 | Admin audit log | **Done** | |
| X3 | Ticket activity / events | **Done** | `ticket_events` |
| X4 | API tokens / webhooks | **Partial** | Pages exist; depth varies |

---

## 4. First Cut release — suggested “in scope” vs “out of scope”

### 4.1 In scope (is release ke saath commit karo)

- [x] Ticket create, list, detail, messages (authenticated)
- [x] **Internal notes** (`is_internal`): agents only; hidden from customers in `GET /tickets/:id`
- [x] **Portal ticket form data**: `GET /tickets/form/products`, `GET /tickets/form/products/:productId/categories` (enabled products + active taxonomy)
- [x] **Attachments**: `POST /tickets/:id/attachments` (multipart `file`, max 10 MB), `GET .../download`, list on ticket detail; disk under `src/storage/uploads/{orgId}/{ticketId}/`
- [x] Routing rules + keyword routing (basic)
- [x] Teams/queues + least-loaded assignment (with cap)
- [x] SLA Tier1 policies + deadlines + pending pause/resume
- [x] Background: resolution SLA 75% warn, resolution breach → escalated, auto-close resolved → closed (7d) — env flag se
- [x] Admin: orgs, products, users, roles, teams, routing, keywords, SLA, templates (content), canned responses, custom fields, audit
- [x] State transitions with validation + reopen rules (window + 3rd reopen escalation)

### 4.2 Out of scope for First Cut (document karke ship karo)

- [ ] Full **workflow sequence** engine + **Workflow → Sequences** admin
- [ ] PRD **Tier 2 SLA** runtime parity
- [ ] **First response** SLA automation (75%/breach)
- [ ] **Notification delivery** pipeline (email/in-app) for all PRD triggers
- [ ] **Chat widget** + email-to-ticket
- [ ] **Business hours / holiday** SLA calendar
- [ ] **Diagnosis note** gate + configurable gates per step
- [ ] **Reopen** → same resolver + **SLA restart** behaviour
- [ ] **Pending 48h** auto-open
- [ ] Routing actions: **tags**, **SLA policy id** in rule actions (if not wired)

---

## 5. Post–First Cut enhancement backlog (priority-sorted)

**Phase A — Stability & parity (short term)**

1. Notification service: template render + queue + send on ticket created/replied/status/SLA warn/breach.
2. First response SLA: deadlines + 75% + breach + internal notes.
3. Reopen: resolver assignment + full SLA recomputation.
4. Create flow: `new` → assign → `open` (optional) OR document “direct open” as standard.
5. Routing rule actions completion: `sla_policy_id`, tags, optional `workflow_sequence_id`.

**Phase B — Workflow MVP**

6. Admin CRUD for `workflow_sequences` / `workflow_steps` + product-category mapping.
7. On create: resolve sequence; set `ticket_workflow_state.sequence_id`, `current_step_order`.
8. Escalate / SLA breach: advance **step** + reassign to step’s team (least-loaded).
9. Gates: diagnosis note; configurable required fields; cancellation reasons list.

**Phase C — SLA & operations**

10. Business hours + holiday calendar for SLA.
11. Tier 2 SLA instances after escalate; Tier 2 warnings/breaches (internal only).
12. Pending 48h automation.
13. OOO exclusion in least-loaded (if field exists).

**Phase D — Channels & UX**

14. Chat widget (PRD Ch.5).
15. Customer portal polish: CSAT, richer ticket detail (SLA countdown UI).
16. Reporting: SLA compliance report (PRD §9.x references).

---

## 6. Release gate checklist (go / no-go)

| Gate | Question | Owner |
|------|----------|--------|
| G1 | Migrations run clean on staging DB? | DevOps / Dev |
| G2 | `enableTicketAutomation` behaviour documented? | Dev — see `server/.env.example` + JSDoc on `env.enableTicketAutomation` in `server/src/config/env.ts` |
| G3 | Smoke: create ticket → route → assign → pending → resolve → closed | QA |
| G4 | Known limitations doc shared (this file §4.2) | PM |
| G5 | Security: auth on all ticket/admin routes | Dev |

---

## 7. Revision history

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-03-28 | Engineering | Initial First Cut checklist |
| 0.2 | 2026-03-29 | Engineering | Ticket form meta APIs, internal notes, attachments (multer + download), checklist %/§4.1 refresh |
| 0.3 | 2026-03-29 | Engineering | Documented `TICKET_AUTOMATION_ENABLED` / SLA + auto-close tick env (G2) |

---

## 8. Implementation log (code pointers)

| Date | Area | What shipped |
|------|------|----------------|
| 2026-03-29 | Messages | `is_internal` on `POST /tickets/:id/messages`; customers don’t receive internal rows in detail |
| 2026-03-29 | Portal form | `ticketsFormMeta.controller.ts`, routes under `/tickets/form/*`; `RaiseTicketPage` uses dropdowns |
| 2026-03-29 | Attachments | `ticketAttachments.controller.ts`, `ticketAttachmentUpload.ts` (multer), `ticket_attachments` + events; `MyTicketsPage` + post-create uploads on Raise Ticket |
| 2026-03-29 | Client HTTP | `httpForm()` + `getApiBaseUrl()` for multipart and authenticated blob download |
| 2026-03-29 | Env / automation | `TICKET_AUTOMATION_ENABLED`, `SLA_TICK_SECONDS`, `AUTO_CLOSE_TICK_SECONDS` documented in `.env.example` and `config/env.ts` |

---

*Ye document living hai — har major sprint ke baad `%` aur checklist rows update karein.*

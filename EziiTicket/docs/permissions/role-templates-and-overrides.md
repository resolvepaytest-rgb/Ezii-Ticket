# Role Templates and Org Override Rules

This document defines how role templates and organization-specific overrides should work.

## Objectives

- Keep a stable baseline for all organisations.
- Allow controlled org customization without breaking security.
- Preserve auditability of every permission change.

## Template model

Global role templates (managed by Ezii):

- `customer`
- `org_admin`
- `l1_agent`
- `l2_specialist`
- `l3_engineer`
- `team_lead`
- `system_admin` (Ezii restricted)

Template fields:

- `screens` (view/modify)
- `actions` (explicit booleans)
- `data_scope` (ticket scope + optional filters)
- `sla` (`tier1`, `tier2`)

## Org custom roles

Each organization can:

- clone a global template into an org role
- create additional org-only custom roles
- adjust `screens`, `actions`, and `data_scope` within policy

Each org role must have:

- immutable `organisation_id`
- a stable role `name`
- full permission payload (no partial schema omissions)

## Override precedence

From lowest to highest:

1. Global role template
2. Organization role definition
3. User-level permission overrides (time-bound supported)

Rules:

- Deny rules should win over allow at the same precedence tier.
- Higher tier override can only relax or tighten as allowed by policy constraints.
- `system_admin` full screen access remains restricted and not downgraded by org-level overrides.

## Constraints (hard rules)

- `modify=true` always implies `view=true`.
- Unknown keys are rejected.
- Key names must follow naming convention (`snake_case` segments, dot-delimited action keys).
- `data_scope.tickets` must be one of:
  - `own_tickets`
  - `org_tickets`
  - `assigned_queue`
  - `product_queue_escalated`
  - `all_tickets`
- Org cannot grant cross-organization data scope.

## Change management

For any role permission change:

- capture before/after payload in admin audit log
- store actor user id and timestamp
- include source (template update, org role edit, user override)

## Recommended operational policy

- Keep template updates centralized and versioned.
- Run impact checks before template edits.
- Provide safe defaults for new permission keys during migrations.
- Avoid deleting keys; deprecate with compatibility windows.


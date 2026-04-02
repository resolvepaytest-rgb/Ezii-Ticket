# Ezii Ticket Permission Architecture

## Objective

Provide one consistent permission model across:

- Navigation and screen access
- API action authorization
- Ticket and entity data visibility

## Current state summary

Implemented:

- Role permissions stored in `roles.permissions_json`
- Screen access model: `screen_access.<screen_key>.view|modify`
- Ticket scope filters via `apply_role_to` (`all`, `reportees`, `attribute`, `sub_attribute`)
- Multi-role merge in `/auth/me/permissions`

Gap:

- Some backend authorization paths still rely on role-name checks instead of permission keys.

## Recommended model (3 layers)

### Layer 1: Screen Capability

Controls whether the user can access a screen/module and related read/write APIs.

Example:

```json
"screens": {
  "routing_rules": { "view": true, "modify": false },
  "priority_master": { "view": true, "modify": true }
}
```

### Layer 2: Action Capability

Controls business actions independent from screen visibility.

Example:

```json
"actions": {
  "tickets.assign": true,
  "tickets.resolve": true,
  "tickets.escalate": true,
  "routing_rules.manage": false,
  "sla.tier1.edit": false
}
```

### Layer 3: Data Scope (Row-Level)

Controls which records a user can read or mutate.

Example:

```json
"data_scope": {
  "tickets": "product_queue_escalated",
  "ticket_filters": {
    "apply_role_to": "attribute",
    "attribute_id": "0",
    "sub_attribute_id": null
  }
}
```

## Canonical permission schema

Use one canonical payload per role:

```json
{
  "screens": {},
  "actions": {},
  "data_scope": {},
  "sla": {
    "tier1": "none|view|edit",
    "tier2": "none|view|edit"
  }
}
```

Notes:

- `modify` implies `view`.
- `actions` are explicit booleans; avoid inferred behavior.
- `data_scope` must be evaluated in all list/get/update/delete APIs.

## Enforcement rules

- Always enforce on backend; do not trust frontend visibility.
- Frontend can hide/disables controls based on permissions for UX.
- For every API endpoint:
  1. Validate screen/action permission
  2. Apply data-scope filter
  3. Return `403` for unauthorized access

## Suggested policy helper

Create centralized policy service:

- `canViewScreen(user, screenKey)`
- `canModifyScreen(user, screenKey)`
- `canDo(user, actionKey)`
- `buildTicketScopeWhere(user, orgId)`

All controllers must consume this service instead of raw role-name checks.

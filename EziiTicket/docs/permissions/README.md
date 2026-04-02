# Permission Model Documentation

This folder defines the recommended permission structure for Ezii Ticket.

## Documents

- `permission-architecture.md`: Target authorization architecture (RBAC + action + data scope).
- `role-screen-action-matrix.md`: Practical role matrix for screens, actions, and ticket data scope.
- `implementation-rollout-checklist.md`: Step-by-step migration plan from current implementation to centralized authorization.
- `api-permission-map.md`: Backend endpoint to permission-key mapping.
- `role-templates-and-overrides.md`: Template baseline and org/user override precedence rules.

## Why this exists

Current implementation has strong foundations in `roles.permissions_json` and screen-level UI filtering, but backend checks are still partially role-name based in some places.  
These documents align frontend and backend into one permission contract.

## Core principles

- Use permission keys, not role name strings, for authorization decisions.
- Keep screen access (UI/API capability) separate from data scope (which rows are visible).
- Enforce all access checks server-side; UI checks are convenience only.
- Keep role templates and org-level overrides, with audit logs for every permission change.

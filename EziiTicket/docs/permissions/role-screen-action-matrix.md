# Role, Screen, and Data Access Matrix

This matrix is a recommended baseline aligned with the PRD and current implementation.

## Standard roles

- Customer
- Org Admin
- L1 Agent
- L2 Specialist
- L3 Engineer
- Team Lead
- System Admin

## Ticket scope baseline

| Role | Ticket Scope |
| --- | --- |
| Customer | Own tickets |
| Org Admin | Own organization tickets |
| L1 Agent | Assigned queue + own assigned/reporter tickets |
| L2 Specialist | Product queue + escalated tickets |
| L3 Engineer | All tickets |
| Team Lead | All tickets |
| System Admin | All tickets |

## Screen access baseline

| Screen | Customer | Org Admin | L1 | L2 | L3 | Team Lead | System Admin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Dashboard | View | View | View | View | View | View+Modify | View+Modify |
| My Tickets | View+Modify | View+Modify | View+Modify | View+Modify | View+Modify | View+Modify | View+Modify |
| Raise a Ticket | View+Modify | View+Modify | View+Modify | View+Modify | View+Modify | View+Modify | View+Modify |
| Users | No | View | No | No | No | View | View+Modify |
| Roles & Permissions | No | View (optional) | No | No | No | View | View+Modify |
| Teams & Queues | No | View | No | No | No | View+Modify | View+Modify |
| Routing Rules | No | View (optional) | No | No | No | View+Modify | View+Modify |
| Priority Master | No | View (optional) | No | No | No | View+Modify | View+Modify |
| Keyword Routing | No | View (optional) | No | No | No | View+Modify | View+Modify |
| SLA Policies | No | View | No | No | No | View | View+Modify |
| Notification Templates | No | View (optional) | No | No | No | View+Modify | View+Modify |
| Canned Responses | View | View | View+Modify | View+Modify | View+Modify | View+Modify | View+Modify |
| Custom Fields | No | View (optional) | No | No | No | View+Modify | View+Modify |
| API Tokens / Webhooks | No | No | No | No | No | View | View+Modify |
| Audit Logs | No | View (org only) | No | No | No | View | View+Modify |

## Action permissions baseline

| Action | Customer | Org Admin | L1 | L2 | L3 | Team Lead | System Admin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tickets.create | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| tickets.assign | No | No | Self | L2 queue | Any | Any | Any |
| tickets.resolve | No | No | Yes | Yes | Yes | Yes | Yes |
| tickets.escalate | Request only | Request/Manual policy | Yes | Yes | Yes | Yes | Yes |
| sla.tier1.view | No | No | No | No | No | Yes | Yes |
| sla.tier1.edit | No | No | No | No | No | No | Yes (bounded) |
| sla.tier2.view | No | No | No | No | No | Yes | Yes |
| sla.tier2.edit | No | No | No | No | No | No | Yes (restricted) |

## Org-specific restrictions

Org Admin can create custom roles and restrict any optional admin screen for their organization.

Examples:

- Agent can be granted `routing_rules.view` and `priority_master.view` without `modify`.
- Customer can be upgraded to `org_tickets` scope for all tickets in same organization.
- Team Lead can keep full ticket actions while denying `api_tokens` and `webhooks`.

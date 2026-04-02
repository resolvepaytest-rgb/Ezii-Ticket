# Phase 2 API Test Pack (cURL)

This verifies:

1. `open -> pending -> resolved`
2. `reopen` within 7 days
3. manual escalate
4. assign / reassign

## 0) Prerequisites

- Server running (default `http://localhost:5000`)
- Valid JWT token
- DB migrated through `015_ticket_workflow_phase2.sql`
- Seed applied:
  - `./test-pack/phase1_2_seed.sql`

## 1) Setup shell vars

```bash
export BASE_URL="http://localhost:5000"
export JWT_TOKEN="<paste-valid-jwt>"
```

## 2) Create a fresh ticket

```bash
curl -s -X POST "$BASE_URL/tickets" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "product_id": 1,
    "category_id": 86,
    "subcategory_id": 254,
    "channel": "widget",
    "priority": "P3",
    "affected_users": 12,
    "subject": "Phase2 flow test ticket",
    "description": "This ticket is created to verify status transitions, reopen rules, escalation and assignment endpoints."
  }' | tee /tmp/phase2-create.json
```

```bash
export TICKET_ID="$(jq -r '.data.id' /tmp/phase2-create.json)"
```

## 3) Move `open -> pending`

```bash
curl -s -X POST "$BASE_URL/tickets/$TICKET_ID/status" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "pending",
    "reason": "waiting_for_customer_input"
  }' | jq
```

## 4) Move `pending -> resolved` (with required resolution note >= 50 chars)

```bash
curl -s -X POST "$BASE_URL/tickets/$TICKET_ID/status" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "resolved",
    "resolution_note": "Issue validated and fixed through configuration correction, cache refresh, and end-user retest confirmation.",
    "reason": "issue_fixed"
  }' | jq
```

## 5) Reopen within 7 days

```bash
curl -s -X POST "$BASE_URL/tickets/$TICKET_ID/reopen" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Issue reoccurred after re-login"
  }' | jq
```

## 6) Manual escalation

Note: use actual target IDs from your environment.

```bash
curl -s -X POST "$BASE_URL/tickets/$TICKET_ID/escalate" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "target_team_id": 1,
    "target_queue_id": 1,
    "handoff_note": "Escalating with logs and impact summary attached.",
    "reason": "complexity"
  }' | jq
```

## 7) Assign / reassign

```bash
curl -s -X POST "$BASE_URL/tickets/$TICKET_ID/assign" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "assignee_user_id": 900001,
    "team_id": 1,
    "queue_id": 1
  }' | jq
```

## 8) Verify timeline + gate logs

```bash
curl -s "$BASE_URL/tickets/$TICKET_ID" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq
```

You should see in `events`:
- `status_changed` for pending/resolved/reopened/escalated
- `assignment_changed` for assign endpoint
- gate records from `ticket_stage_gate_results` for resolution checks


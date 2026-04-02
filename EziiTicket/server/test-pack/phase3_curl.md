# Phase 3 API Test Pack (cURL)

This verifies:

1. SLA warning event at ~75%
2. SLA breach -> auto escalation
3. pending pause/resume due-date shift
4. resolved -> auto-close after 7 days

## 0) Prerequisites

- Server running with automation enabled
- DB migrated through `016_sla_runtime_phase3.sql`
- Seed applied (`phase1_2_seed.sql`)
- valid JWT token

Set env for faster verification (optional, test-only):

```bash
export TICKET_AUTOMATION_ENABLED=1
export SLA_TICK_SECONDS=15
export AUTO_CLOSE_TICK_SECONDS=30
```

## 1) Setup variables

```bash
export BASE_URL="http://localhost:5000"
export JWT_TOKEN="<paste-valid-jwt>"
```

## 2) Create test ticket

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
    "affected_users": 8,
    "subject": "Phase3 SLA runtime verification",
    "description": "This ticket validates warning, breach escalation, pause resume math, and auto-close scheduler behavior."
  }' | tee /tmp/phase3-create.json
```

```bash
export TICKET_ID="$(jq -r '.data.id' /tmp/phase3-create.json)"
```

## 3) Force warning window quickly (DB helper)

Adjust timestamps so ticket is just after 75% elapsed but before due:

```bash
psql "$DATABASE_URL" -c "
update tickets
set created_at = now() - interval '80 minutes',
    resolution_due_at = now() + interval '10 minutes',
    updated_at = now()
where id = $TICKET_ID;
"
```

Wait one SLA tick, then verify warning event:

```bash
sleep 20
curl -s "$BASE_URL/tickets/$TICKET_ID" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq '.data.events[] | select(.event_type == "sla_warning")'
```

## 4) Force breach -> auto-escalation

```bash
psql "$DATABASE_URL" -c "
update tickets
set status = 'open',
    resolution_due_at = now() - interval '2 minutes',
    updated_at = now()
where id = $TICKET_ID;
"
```

Wait one SLA tick, then verify status + events:

```bash
sleep 20
curl -s "$BASE_URL/tickets/$TICKET_ID" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq '.data.status'
```

```bash
curl -s "$BASE_URL/tickets/$TICKET_ID" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq '.data.events[] | select(.metadata_json.reason == "sla_resolution_breach")'
```

Expected:
- status is `escalated`
- breach status event exists

## 5) Verify pending pause/resume due-date shift

Set to open first:

```bash
curl -s -X POST "$BASE_URL/tickets/$TICKET_ID/status" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"open","reason":"prepare_pause_resume_test"}' | jq
```

Capture due-at before pause:

```bash
export BEFORE_DUE="$(psql "$DATABASE_URL" -Atc "select resolution_due_at from tickets where id = $TICKET_ID")"
echo "$BEFORE_DUE"
```

Pause:

```bash
curl -s -X POST "$BASE_URL/tickets/$TICKET_ID/status" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"pending","reason":"waiting_for_customer"}' | jq
```

Wait ~30s:

```bash
sleep 30
```

Resume:

```bash
curl -s -X POST "$BASE_URL/tickets/$TICKET_ID/status" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"open","reason":"customer_replied"}' | jq
```

Check due-at moved later:

```bash
export AFTER_DUE="$(psql "$DATABASE_URL" -Atc "select resolution_due_at from tickets where id = $TICKET_ID")"
echo "before=$BEFORE_DUE"
echo "after=$AFTER_DUE"
```

Expected: `AFTER_DUE` > `BEFORE_DUE` by approximately pause duration.

## 6) Verify auto-close after 7 days

Resolve first (with required resolution note):

```bash
curl -s -X POST "$BASE_URL/tickets/$TICKET_ID/status" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status":"resolved",
    "resolution_note":"Resolved after validating root cause, applying fix, retesting edge paths, and confirming expected behavior in production mirror.",
    "reason":"resolved_for_auto_close_test"
  }' | jq
```

Backdate `resolved_at`:

```bash
psql "$DATABASE_URL" -c "
update tickets
set resolved_at = now() - interval '8 days',
    status = 'resolved',
    updated_at = now()
where id = $TICKET_ID;
"
```

Wait one auto-close tick:

```bash
sleep 35
curl -s "$BASE_URL/tickets/$TICKET_ID" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq '.data.status'
```

Expected: `closed`


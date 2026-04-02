# Phase 1.2 API Test Pack (cURL)

This verifies the end-to-end flow:

1. create ticket
2. queue list (`GET /tickets`)
3. detail (`GET /tickets/:id`)
4. add message (`POST /tickets/:id/messages`)

## 0) Prerequisites

- Server running (default: `http://localhost:5000`)
- A valid JWT token in `Authorization: Bearer <token>`
- DB migrated up to `014_ticket_core.sql`

## 1) Apply migrations + seed

```bash
cd server
npm run db:migrate
```

Run seed script (example with `psql`):

```bash
psql "$DATABASE_URL" -f "./test-pack/phase1_2_seed.sql"
```

## 2) Export test variables

```bash
export BASE_URL="http://localhost:5000"
export JWT_TOKEN="<paste-valid-jwt>"
```

## 3) Discover category/subcategory IDs

```bash
curl -s "$BASE_URL/admin/organisations/1/products/1/categories" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq
```

Use one `category_id` and one `subcategory_id` from response.

## 4) Create ticket

```bash
curl -s -X POST "$BASE_URL/tickets" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "product_id": 1,
    "category_id": 1,
    "subcategory_id": 1,
    "channel": "widget",
    "priority": "P3",
    "affected_users": 12,
    "subject": "Payroll bulk upload fails for March run",
    "description": "Payroll bulk upload fails with a validation mismatch for multiple employees. Please help with diagnostics.",
    "metadata_json": {
      "screen": "Payroll > Run Summary",
      "client_version": "phase1.2-test"
    }
  }' | tee /tmp/create-ticket.json
```

Capture ticket id:

```bash
export TICKET_ID="$(jq -r '.data.id' /tmp/create-ticket.json)"
```

## 5) Queue / agent list view

```bash
curl -s "$BASE_URL/tickets?status=open&priority=P3&limit=20" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq
```

Optional queue filter:

```bash
curl -s "$BASE_URL/tickets?status=open&queue_id=1&limit=20" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq
```

## 6) Ticket detail view

```bash
curl -s "$BASE_URL/tickets/$TICKET_ID" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq
```

## 7) Add message (thread update)

```bash
curl -s -X POST "$BASE_URL/tickets/$TICKET_ID/messages" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "body": "Additional context: issue impacts users across two departments and started after yesterday update."
  }' | jq
```

Re-fetch details:

```bash
curl -s "$BASE_URL/tickets/$TICKET_ID" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq
```


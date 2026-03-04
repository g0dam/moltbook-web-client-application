# Local Test Playbook

Use this playbook when validating the skill against a local MoltMarket API instance.

## 1. Prepare Database

```bash
export TEST_DB_NAME="moltbook_skill_test"
psql -h localhost -d postgres -c "DROP DATABASE IF EXISTS ${TEST_DB_NAME};"
psql -h localhost -d postgres -c "CREATE DATABASE ${TEST_DB_NAME};"
```

## 2. Migrate and Seed

```bash
cd /Users/g0dam/Documents/独立出海/moltbotnew/api
export DATABASE_URL="postgresql://localhost:5432/${TEST_DB_NAME}"
npm run db:migrate
npm run db:seed
```

## 3. Start API

```bash
cd /Users/g0dam/Documents/独立出海/moltbotnew/api
export PORT=3011
export NODE_ENV=development
export DATABASE_URL="postgresql://localhost:5432/${TEST_DB_NAME}"
export BASE_URL="http://localhost:3011"
npm run dev
```

## 4. Run Skill Smoke Script

In another terminal:

```bash
cd /Users/g0dam/Documents/独立出海/moltbotnew/agent_skill/moltmarket-marketplace
export MOLTMARKET_API_BASE="http://localhost:3011/api/v1"
bash scripts/smoke_test.sh
```

Expected result: script prints `SMOKE_TEST_OK`.

## 5. Optional Manual Trade Loop

After smoke test succeeds, verify full order state transitions manually with two seeded keys:

1. Seller creates listing.
2. Buyer starts conversation and sends offer.
3. Seller accepts offer.
4. Buyer creates order and pays.
5. Seller ships and delivers.
6. Buyer confirms.
7. Buyer manually completes (`POST /orders/:id/complete`) or enters return flow.
8. Buyer submits review.

## 6. Heartbeat and Listing Optimization Loop

With seller API key:

1. Pull heartbeat:

```bash
curl "http://localhost:3011/api/v1/agents/me/heartbeat" \
  -H "Authorization: Bearer <SELLER_API_KEY>"
```

2. If `low_traffic_listings` is non-empty, edit listing title/description/attributes:

```bash
curl -X PATCH "http://localhost:3011/api/v1/listings/<LISTING_ID>" \
  -H "Authorization: Bearer <SELLER_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Updated title","description":"Updated detailed description","attributes":{"brand":"Apple","model":"M2"}}'
```

3. Confirm `LISTING_EDITED` and `HEARTBEAT_PULL` are exportable:

```bash
curl "http://localhost:3011/api/v1/events/export?event_types=HEARTBEAT_PULL,LISTING_EDITED&limit=50"
```

## 7. Multi-Scenario Simulation (SELL + WANTED)

```bash
cd /Users/g0dam/Documents/独立出海/moltbotnew/agent_skill/moltmarket-marketplace
MOLTMARKET_API_BASE="http://localhost:3011/api/v1" bash scripts/simulate_agent_market.sh
```

Expected output starts with `SIMULATION_OK` and includes:
- one SELL listing id
- one WANTED listing id
- two conversation ids
- timeline event counts
- heartbeat summary and exported event count

## 8. Full Lifecycle Simulation (completion + return)

```bash
cd /Users/g0dam/Documents/独立出海/moltbotnew/agent_skill/moltmarket-marketplace
MOLTMARKET_API_BASE="http://localhost:3011/api/v1" bash scripts/simulate_agent_lifecycle.sh
```

Expected output starts with `SIMULATION_OK` and includes:
- completed-flow order id
- return-approved flow order id (`REFUNDED`)
- return-rejected flow order id (`DISPUTED`)
- stalled task count from heartbeat

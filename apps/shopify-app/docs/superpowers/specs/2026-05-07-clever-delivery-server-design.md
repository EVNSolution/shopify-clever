# clever-delivery-server Design

## Status

Draft for implementation planning. The user-provided name was `clever-delivary-server`; this spec recommends the corrected spelling `clever-delivery-server` for repository/package names, while preserving `clever` product naming.

## Decision Summary

Build a separate delivery data server beside the Shopify embedded app. Start with one EC2 instance using EBS-backed PostgreSQL for the internal operational database. Do not create a separate EC2 DB server. When data volume, reliability needs, or operational burden grows, migrate PostgreSQL to RDS.

## Target Result

The server owns delivery operations data that should not be fetched live from Shopify on every screen:

- Shopify order ingestion and reconciliation
- Internal order/delivery-stop database
- Route planning and optimization
- Driver/vehicle management
- Driver mobile API
- Delivery status, location, proof-of-delivery, and analytics data

The Shopify app remains the admin UI/BFF. The driver app calls this delivery server, not Shopify directly.

## Architecture

### MVP Infrastructure

```text
EC2 instance: clever-delivery-server
├─ Nginx reverse proxy
├─ Shopify admin/data API process
├─ Webhook handler
├─ Sync worker
├─ Route optimizer worker
├─ Driver API
└─ PostgreSQL using separate encrypted EBS data volume
```

### Growth Path

```text
Phase 1: EC2 + EBS PostgreSQL
Phase 2: EC2 app/worker + RDS PostgreSQL
Phase 3: API/worker separation if traffic requires it
```

There is intentionally no long-lived "DB-only EC2" phase. If DB separation becomes necessary, use RDS.

## Service Boundaries

### Shopify Embedded App (`clever`)

Responsibilities:

- Merchant/admin UI inside Shopify Admin
- OAuth/session handling
- Admin screens for orders, routes, analytics, workflows, drivers, vehicles, and settings
- Calls delivery server APIs for internal delivery data

### Delivery Server (`clever-delivery-server`)

Responsibilities:

- Store internal delivery state
- Receive Shopify webhooks
- Pull Shopify Admin GraphQL API for initial sync and reconciliation
- Normalize orders into delivery stops
- Generate route plans
- Serve driver app APIs
- Store driver activity and proof-of-delivery metadata

### Shopify Admin GraphQL API

Used by the server for real data access. Shopify GraphiQL is only a development/testing tool for trying queries.

## Data Storage

Initial database: PostgreSQL on the same EC2 instance, with data on a dedicated encrypted EBS volume.

Required backup posture:

- Daily EBS snapshot
- Daily `pg_dump` to compressed file
- Optional S3 upload for dump files
- Restore rehearsal before production use

RDS migration trigger:

- DB size or traffic grows beyond comfortable EC2 operation
- Backup/restore requirements become stricter
- Need managed maintenance, monitoring, failover, or easier scaling

## Core Data Model

Initial tables/models:

- `Shop`
- `Session` or Shopify session adapter equivalent
- `WebhookEvent`
- `SyncRun`
- `Order`
- `OrderItem`
- `DeliveryStop`
- `Address` / geocode fields
- `Driver`
- `Vehicle`
- `RoutePlan`
- `RouteStop`
- `RouteAssignment`
- `DriverEvent`
- `ProofOfDelivery`

## Shopify Sync Flow

### Initial Sync

```text
App installed or sync requested
→ use stored offline access token
→ call Shopify Admin GraphQL API
→ pull recent orders
→ upsert orders and delivery stops
→ write SyncRun result
```

### Webhook Flow

```text
Shopify webhook
→ verify HMAC
→ store WebhookEvent for idempotency/audit
→ enqueue or process order upsert
→ update Order and DeliveryStop
```

### Reconciliation Flow

```text
cron/systemd timer
→ pull recently updated Shopify orders
→ compare with internal DB
→ repair missing/stale records
```

## Route Optimization MVP

Initial algorithm should be simple and replaceable:

1. Select delivery stops by date/status/shop.
2. Ensure each stop has latitude/longitude.
3. Group by delivery area/date if available.
4. Generate sequence using nearest-neighbor or distance matrix.
5. Save `RoutePlan` and `RouteStop` rows.
6. Assign route to driver.

Later optimizer upgrades can support capacity, time windows, vehicle constraints, driver shifts, and OR-Tools-style VRP.

## API Surface

### Admin/Internal API

```http
GET    /api/orders
GET    /api/orders/:id
POST   /api/sync/orders
GET    /api/delivery-stops
POST   /api/routes/preview
POST   /api/routes/optimize
GET    /api/routes/:id
POST   /api/routes/:id/assign
GET    /api/drivers
POST   /api/drivers
GET    /api/vehicles
POST   /api/vehicles
```

### Driver API

```http
POST   /driver-api/auth/login
GET    /driver-api/me
GET    /driver-api/routes/today
GET    /driver-api/routes/:id/stops
POST   /driver-api/stops/:id/start
POST   /driver-api/stops/:id/arrive
POST   /driver-api/stops/:id/complete
POST   /driver-api/stops/:id/fail
POST   /driver-api/location
POST   /driver-api/proof-of-delivery
```

## Deployment Layout

```text
/opt/clever-delivery-server/
├─ app/
├─ docker-compose.yml
├─ .env
├─ nginx/
├─ scripts/
└─ backups/

/data/postgres/   # mounted EBS data volume
```

## Security Requirements

- Restrict SSH to trusted IPs.
- Do not expose PostgreSQL publicly.
- Enable EBS encryption.
- Store Shopify API secret/access tokens in environment or secrets store, not git.
- Verify all Shopify webhook HMACs.
- Use JWT/session auth for driver APIs.
- Keep raw webhook payloads for audit/debugging with retention policy.
- Run OS/package security updates.

## Implementation Phases

### Phase 1: Server Skeleton and Infrastructure

- Create `clever-delivery-server` project scaffold.
- Add Docker Compose for app + PostgreSQL + Nginx.
- Configure PostgreSQL data path for EBS mount.
- Add environment template and deployment notes.
- Add backup/restore scripts.

### Phase 2: Database and Shopify Sync

- Add Prisma or equivalent DB schema.
- Implement Shopify Admin GraphQL client.
- Implement initial order sync.
- Implement webhook verification and idempotent event storage.
- Implement order/delivery-stop upsert.

### Phase 3: Admin App Integration

- Change Shopify app order screen to read internal delivery server data.
- Add sync trigger/status UI.
- Add route management API calls.

### Phase 4: Route MVP

- Add route plan/route stop models.
- Implement basic route optimizer.
- Render optimized route order in admin UI.

### Phase 5: Driver API

- Add driver auth.
- Add today route/stop APIs.
- Add stop status and location event APIs.
- Add proof-of-delivery metadata flow.

### Phase 6: RDS Migration Readiness

- Keep `DATABASE_URL` portable.
- Avoid local filesystem DB coupling except EBS mount.
- Document `pg_dump`/restore to RDS.
- Define cutover checklist.

## Open Decisions

- Confirm final spelling: `clever-delivery-server` recommended vs `clever-delivary-server` as originally typed.
- Choose implementation stack for the server: Node/TypeScript is recommended for consistency with the Shopify app.
- Decide whether to keep the server inside the current repo initially or create a sibling repository.

## Self-Review

- No separate DB EC2 is proposed.
- RDS is the intended scale-out database target.
- The server connects to Shopify Admin GraphQL API, not GraphiQL.
- MVP is small enough for a first implementation plan.
- Backup and migration risks are explicitly captured.

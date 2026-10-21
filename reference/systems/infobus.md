**Last verified:** 2026-10-20

# Infobús

> **Source note:** Content below was checked against the infobus repository at commit `8c79fd5` (main): `compose.dev.yml`, `compose.prod.yml`, `backend/`, `frontend/`, `context/`, `knowledge/`, `database/`. The infobus `AGENTS.md`, `README.md`, `ARCHITECTURE.md` and `scripts/README.md` are partly stale and were not used as source of truth. Sections 1–5 were rewritten in October 2026; earlier versions described a planned design (screens, GraphQL, SSE) that was never built.

## 1. Role in SIMOVI

Infobús is the passenger-facing real-time transit information platform. It sits downstream of Databús: it polls GTFS Schedule and GTFS Realtime feeds, stores them, tracks vehicle **runs** and their lifecycle, and pushes topic-based snapshots to clients over WebSocket, alongside a read-only, rate-limited REST API. It **only consumes** GTFS-RT; it never produces it. It is multi-agency by design through `TransitSystem` → `FeedPublisher`. Feed URLs live in the database on `FeedPublisher` rows, not in environment variables.

Still scaffolding (provisioned, no domain path): the Nuxt UI (template with mock data), the FastMCP server (a single `greet` tool), the Fuseki knowledge graph (empty dataset), and RabbitMQ (deployed, not the Celery broker).

## 2. Repository Structure

```
backend/              # Django 6 / Python 3.14, uv-managed
  infobus/            # project package: settings.py, celery.py, asgi.py, urls.py
  feed/               # GTFS Schedule + RT models, import/persistence/Parquet services, purge_old_data
  engine/             # Celery tasks (engine/tasks.py), InfoProvider / InfoService
  runs/               # Run model, lifecycle state machine, Redis run state, reconcile_active_runs
  updates/            # Redis-stream consumer, builders, projections, topics, WebSocket consumer
  api/                # DRF read-only REST API, throttling, hand-written OpenAPI (infobus.yml)
  website/            # Django template pages, user profile
  gtfs-io/, gtfs-django/   # NOT in git: cloned by docker-entrypoint.sh, uv workspace members
frontend/             # Nuxt 4 + Nuxt UI 4 + pnpm — dashboard template with mock server routes
context/              # FastMCP 3 server (greet tool only)
knowledge/            # Apache Jena Fuseki 5.3 (empty TDB2 dataset)
database/             # postgres 18.3 + PostGIS image
docs/                 # Zensical site (most pages still stubs); docs/old/ is legacy MkDocs
compose.dev.yml, compose.prod.yml, scripts/dev.sh, scripts/prod.sh
```

There is no `alerts`, `screens`, `channels` or `tasks` app, no GraphQL, no SSE, and no git submodule.

## 3. Compose Services

Dev (`compose.dev.yml`, project `infobus-dev`):

| Service | Build / image | Purpose |
|---|---|---|
| `orchestrator` | `backend`, target `dev` (prod: `daphne infobus.asgi:application`) | Django: REST API, admin, website, `/ws/updates/`. Only service with `DJANGO_SETUP=True` (migrate, collectstatic, fixtures). Port 8000 |
| `engine` | `backend`, target `engine` | `celery -A infobus worker` — feed ingestion, run lifecycle, Parquet export, purge |
| `scheduler` | `backend`, target `scheduler` | `celery -A infobus beat` |
| `streams-consumer` | `backend`, target `streams-consumer` | `python -m updates.client` — reads Redis stream `events`, builds projections, pushes to the Channels layer. Runs in dev and prod |
| `database` | `./database` (postgres 18.3 + PostGIS 3) | Schedule, realtime records, runs |
| `memory` | redis 8 (8.10.1 in prod), password-protected | Celery broker and results cache, run state, `events` stream, Channels layer, cache |
| `broker` | rabbitmq 4 management | Provisioned; a Compose dependency only, not the Celery broker |
| `context` | `./context` (FastMCP) | MCP server, port 3278, stub |
| `knowledge` | `./knowledge` (Jena Fuseki) | SPARQL server, port 3030, empty |
| `user-interface` | `./frontend` (Nuxt) | Port 3000, `NUXT_PUBLIC_API_BASE` set but unread |

Prod (`compose.prod.yml`, project `infobus-prod`) drops host ports and source mounts, adds `restart: unless-stopped`, `no-new-privileges`, an `internal` network plus external `traefik_proxy`, and Traefik routers (TLS, Let's Encrypt) for `orchestrator`, `user-interface`, `context`, `knowledge` and the prod-only `docs` (nginx). The broker has no router.

## 4. Key Models

**TransitSystem** (`feed`): top-level grouping of publishers for a transit authority.

**FeedPublisher** (`feed`): one feed source. Holds `schedule_url`, `trip_updates_url`, `vehicle_positions_url`, `alerts_url`, language, timezone, `is_active`. Edited in admin.

**Feed / FeedMessage** (`feed`): schedule import tracking (ETag, validity dates, `is_current`) and RT header metadata.

**GTFS Schedule models** (`feed`, subclassing `gtfs.models.Base*` from `gtfs-django`): Agency, Stop (`stop_point` PostGIS Point), Route, Calendar, CalendarDate, Shape, Trip, StopTime, FareAttribute, FareRule, FeedInfo, plus infobus-specific GeoShape, RouteStop, TripDuration, TripTime. Schedule import is atomic and isolated per publisher.

**GTFS-RT models** (`feed`): TripUpdate, StopTimeUpdate, VehiclePosition (`position_point`, srid 4326), Alert, EntitySelector, TimeRange, Translated* types.

**Run** (`runs`): a tracked vehicle run with a lifecycle state machine; current state is kept in Redis active sets, durable records in PostgreSQL.

**InfoProvider / InfoService** (`engine`): catalogue of information services; `type` includes `screens`, but there is no Screen model.

**Weather, CommonAlert, Social** (`updates`): skeleton models with no fetchers, tasks or API.

## 5. Key Flows

### GTFS-RT ingestion and push

```
Celery Beat (every 30 s) → update_gtfs_realtime  [group]
  → get_vehicle_positions / get_trip_updates / get_alerts
      [HTTP GET each active FeedPublisher URL, ParseFromString, save to PostgreSQL,
       update run state in Redis, XADD to stream `events`]
Celery Beat (every 60 s) → evaluate_run_lifecycles  [classify runs by feed health and silence]
streams-consumer (updates.client)
  → XREADGROUP `events` (group `updates`; failures to `events:dead-letter`)
  → planner / builders / projections → Channels group_send
  → UpdatesConsumer at ws/updates/ → subscribed clients receive {topic, message} snapshots
```

Clients send `{"action":"subscribe"|"unsubscribe","topic":...}`. Topic format: `transit_system.entity.info.selector.value[.qualifier_selector.qualifier_value]`.

### GTFS Schedule refresh

```
Celery Beat (minute 30 hourly) → get_schedule
  → per active publisher: detect new version, download, validate required members,
    import atomically; one publisher's failure does not affect others
```

### Parquet export and retention

```
Celery Beat (hourly, minute 0) → save_gtfs_realtime
  → save_vehicle_positions (GeoParquet) + save_stop_time_updates (Parquet) → lake_data volume
Celery Beat (daily 03:15) → purge_old_data
  → batched deletion past REALTIME_/SCHEDULE_/PARQUET_RETENTION_DAYS (manage.py purge_old_data is dry-run by default)
```

The Beat schedule is hardcoded in `backend/infobus/celery.py`.

### REST

Read-only DRF router under `/api/` (agencies, stops, routes, trips, stop-times, shapes, calendars, fares, feed-info, feed-publishers, info-services, geo-stops, geo-shapes) plus `next-trips/`, `next-stops/`, `route-stops/`; Redoc at `/api/docs/`. Anonymous 60/min, geometry 10/min, realtime 30/min by default; throttles fail open if Redis is down.

### MCP / knowledge graph (not implemented)

`context/` exposes only `greet(name)`; nothing queries Fuseki or the database yet, and Fuseki has no ontology or data.

## 6. Links to FSMs

All Infobús process state machines are defined in `behavior/infobus/system/`. XState-compatible JSON in `json/`; full process documentation in `docs/`.

> **Drift warning:** these FSMs were not re-checked in the October 2026 rewrite and likely describe the earlier planned design (`poll-gtfs-feed`, `update-display-state`, `broadcast-display-update`, `save-feed-snapshot`) rather than the tasks in section 5. Run `src2fsm` before relying on them.

| Process | JSON | Doc |
|---|---|---|
| `poll-gtfs-schedule` | [`behavior/infobus/system/json/poll-gtfs-schedule.json`](../../behavior/infobus/system/json/poll-gtfs-schedule.json) | [`docs/poll-gtfs-schedule.md`](../../behavior/infobus/system/docs/poll-gtfs-schedule.md) |
| `poll-gtfs-feed` | [`behavior/infobus/system/json/poll-gtfs-feed.json`](../../behavior/infobus/system/json/poll-gtfs-feed.json) | [`docs/poll-gtfs-feed.md`](../../behavior/infobus/system/docs/poll-gtfs-feed.md) |
| `save-feed-snapshot` | [`behavior/infobus/system/json/save-feed-snapshot.json`](../../behavior/infobus/system/json/save-feed-snapshot.json) | [`docs/save-feed-snapshot.md`](../../behavior/infobus/system/docs/save-feed-snapshot.md) |
| `update-display-state` | [`behavior/infobus/system/json/update-display-state.json`](../../behavior/infobus/system/json/update-display-state.json) | [`docs/update-display-state.md`](../../behavior/infobus/system/docs/update-display-state.md) |
| `broadcast-display-update` | [`behavior/infobus/system/json/broadcast-display-update.json`](../../behavior/infobus/system/json/broadcast-display-update.json) | [`docs/broadcast-display-update.md`](../../behavior/infobus/system/docs/broadcast-display-update.md) |

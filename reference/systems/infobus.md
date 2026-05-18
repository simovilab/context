**Last verified:** 2026-05-17

# Infobús

> **Source note:** Content below is sourced from the current Infobús repository state (compose.dev.yml, backend/, frontend/, context/, knowledge/ directories as of 2026-05-17). The infobus AGENTS.md is stale and was not used as source of truth.

## 1. Role in SIMOVI

Infobús is the passenger-facing real-time transit information platform. It sits downstream of Databús in the SIMOVI stack: it polls GTFS Realtime feeds published by Databús, enriches them with GTFS Schedule data and spatial context, and pushes computed display payloads to connected kiosks, SSE clients, and web browsers. Infobús is multi-agency by design — it models a `TransitSystem` / `GTFSProvider` hierarchy that supports multiple simultaneous feed sources. It also exposes a FastMCP server for LLM tool integrations and maintains a semantic knowledge graph via Apache Jena Fuseki for advanced queries.

## 2. Repository Structure

```
backend/              # Django application
  engine/             # Core realtime engine: feed polling, display state computation
  screens/            # Screen model, route subscriptions, spatial filters (PostGIS)
  gtfs/               # GTFS Schedule models (gtfs-django), feed ingestion pipeline
  api/                # REST + GraphQL (Strawberry) API
  channels/           # Django Channels WebSocket/SSE broadcast layer
  tasks/              # Celery tasks: poll-gtfs-feed, update-display-state, etc.
frontend/             # Nuxt 3 frontend (passenger-facing web interface)
context/              # FastMCP server — exposes transit domain tools for LLM integrations
knowledge/            # Apache Jena Fuseki RDF triple store — GTFS/transit ontology
compose.dev.yml       # Docker Compose for local development
```

## 3. Compose Services

| Service | Image / Build | Purpose |
|---|---|---|
| `api` | `./backend` (Django + ASGI) | Django REST + GraphQL API, Django Channels WebSocket/SSE hub |
| `engine` | `./backend` (Celery worker) | Feed polling worker: `poll-gtfs-feed`, `update-display-state`, `broadcast-display-update` |
| `scheduler` | `./backend` (Celery Beat) | Periodic triggers: high-cadence (~15 s) for `poll-gtfs-feed`, low-cadence for `poll-gtfs-schedule` and `save-feed-snapshot` |
| `broker` | `rabbitmq` | RabbitMQ — internal message bus connecting Celery workers and Django Channels |
| `db` | `postgres` (PostGIS) | PostgreSQL + PostGIS — GTFS Schedule, screen models, feed snapshots, spatial data |
| `memory` | `redis` | Redis — GTFS-RT snapshots, per-screen display state, provider degraded flags |
| `frontend` | `./frontend` (Nuxt 3) | Passenger-facing web UI; connects to `api` via WebSocket/SSE for real-time updates |
| `context` | `./context` (FastMCP) | MCP server exposing transit tools (next-trip lookup, stop search, alerts, geospatial queries) |
| `knowledge` | `apache/jena-fuseki` | SPARQL server + RDF triple store; serves transit ontology and linked data queries |

## 4. Key Models

**TransitSystem**: Top-level entity grouping all providers, screens, and feeds for a given transit authority (e.g., a city bus system).

**GTFSProvider**: A GTFS feed source within a `TransitSystem`. Holds the Schedule and Realtime feed URLs, polling cadence, version tracking, and degraded status flag.

**Screen**: A physical or virtual display unit. Has a PostGIS `Point` location, route subscriptions, display configuration, and a `display_state` key in Redis. Screens are the unit of computation for `update-display-state`.

**GTFS Schedule models** (via `gtfs-django`): `Route`, `Trip`, `Stop`, `StopTime`, `Calendar`, `CalendarDate`, `Shape`. Loaded atomically via the `poll-gtfs-schedule` process — staging tables are promoted to live in a single transaction.

**Feed snapshot**: Parsed GTFS-RT DataClass objects written to Redis by `poll-gtfs-feed`. Ephemeral; periodically serialized to Parquet by `save-feed-snapshot`.

## 5. Key Flows

### GTFS-RT Display Pipeline

```
Celery Beat (every ~15 s)
  → poll-gtfs-feed  [fetch protobuf, parse via gtfs-io, write snapshot to Redis]
  → update-display-state  [load snapshot, apply PostGIS spatial filter + route subscriptions,
                           compute per-screen payloads, write to Redis]
  → broadcast-display-update  [read changed screen payloads, push to Django Channels groups]
  → connected clients (WebSocket / SSE) receive live display update
```

### GTFS Schedule Refresh

```
Celery Beat (low-cadence, e.g. hourly)
  → poll-gtfs-schedule  [detect version change, download zip, validate referential integrity,
                         stage via gtfs-django, promote atomically to live DB]
  → emit assertion to RabbitMQ (triggers knowledge graph update)
```

### Historical Snapshot Persistence

```
Celery Beat (periodic)
  → save-feed-snapshot  [read current Redis snapshot, convert to Parquet,
                         persist to database with metadata, emit persistence assertion]
```

### MCP / LLM Integration

```
LLM client (Claude Desktop, etc.)
  → context/ FastMCP server
  → tools: next-trip lookup, stop search, alert query, geospatial proximity
  → backend API (REST / GraphQL)
  → real-time data from Redis + schedule data from PostgreSQL
```

## 6. Links to FSMs

All Infobús process state machines are defined in `behavior/infobus/system/`. XState-compatible JSON in `json/`; full process documentation in `docs/`.

| Process | JSON | Doc |
|---|---|---|
| `poll-gtfs-schedule` | [`behavior/infobus/system/json/poll-gtfs-schedule.json`](../../behavior/infobus/system/json/poll-gtfs-schedule.json) | [`docs/poll-gtfs-schedule.md`](../../behavior/infobus/system/docs/poll-gtfs-schedule.md) |
| `poll-gtfs-feed` | [`behavior/infobus/system/json/poll-gtfs-feed.json`](../../behavior/infobus/system/json/poll-gtfs-feed.json) | [`docs/poll-gtfs-feed.md`](../../behavior/infobus/system/docs/poll-gtfs-feed.md) |
| `save-feed-snapshot` | [`behavior/infobus/system/json/save-feed-snapshot.json`](../../behavior/infobus/system/json/save-feed-snapshot.json) | [`docs/save-feed-snapshot.md`](../../behavior/infobus/system/docs/save-feed-snapshot.md) |
| `update-display-state` | [`behavior/infobus/system/json/update-display-state.json`](../../behavior/infobus/system/json/update-display-state.json) | [`docs/update-display-state.md`](../../behavior/infobus/system/docs/update-display-state.md) |
| `broadcast-display-update` | [`behavior/infobus/system/json/broadcast-display-update.json`](../../behavior/infobus/system/json/broadcast-display-update.json) | [`docs/broadcast-display-update.md`](../../behavior/infobus/system/docs/broadcast-display-update.md) |

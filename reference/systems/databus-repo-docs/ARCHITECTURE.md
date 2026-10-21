> Refreshed against databus `main` @ `1be2da1` (2026-10-20). Condensed from the as-built system; full detail in `reference/systems/databus.md`.

# Architecture

## Data flow

```
OBE device ──MQTT transit/vehicle/<id>/{position,occupancy}──▶ telemetry-broker (NanoMQ)
HTTP APIs ──fetch_positions (beat 10 s)──publish same topic──▶        │
                                                                      ▼
                                   realtime-engine: MQTT bootstep (validate, HSET, runs:last_seen)
                                                                      ▼
                                   process_position_update (Celery): map-matching → vehicle_stop_status
                                     → RUN_COMPLETED candidate → ETA stop_time_updates → run-start check
                                                                      ▼
                                   Redis (state)  ◀── lifecycle actions (also from orchestrator API)
                                                                      ▼
                                   schedule-engine (beat 15 s): build_vehicle_positions / build_trip_updates
                                     → backend/feed/files/*.{json,pb}  → /feed/realtime/*
                                   build_schedule (daily) → gtfs.zip → /feed/schedule/feed.zip
```

## Services and mandates

- **orchestrator** — DRF API (`/api/create-run/`, `/api/runs/<id>/{state,update,history}/`, `/api/service-today/`, `/api/which-shapes/`, `/api/find-trips/`, docs at `/api/docs/`), admin, WebSocket `ws/status/`.
- **realtime-engine** — telemetry ingestion, detection, `scan_stale_runs` (30 s; grace 60 s, expiry 600 s), `fetch_positions`.
- **schedule-engine** — feed builders, `build_schedule`, `fetch_schedule` (hourly at :30, ETag check on active `FeedPublisher.schedule_url`).
- **scheduler** — Celery Beat with the in-code schedule.
- **database / state / message-broker / telemetry-broker** — Postgres+PostGIS, Redis, RabbitMQ (Celery broker + `databus.events`), NanoMQ.

## Messaging status

MQTT is live (QoS 0). RabbitMQ carries Celery traffic; `publish_event` emits `runs.lifecycle.<event>` (topic exchange `databus.events`) but has no consumers. The command/observation/assertion message design is not implemented.

## State and persistence

Redis: authoritative real-time state (only `stop_time_updates` has a TTL, 60 s). PostgreSQL: GTFS Schedule (via `gtfs-django` models and the `feed` app), runs, `RunLifecycleTransition` audit. Feeds are files on a shared `feed_files` volume in prod.

## Deployment

Dev: `compose.dev.yml` (project `databus-dev`, network `databus_network`). Prod: `compose.prod.yml` (`databus-prod`), external Traefik, no published ports, `internal` + `traefik_proxy` networks, extra `docs` service. Dockerfile stages: `dev`, `prod` (daphne), `realtime-engine`, `schedule-engine`, `scheduler`.

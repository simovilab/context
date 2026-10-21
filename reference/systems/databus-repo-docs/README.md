> Refreshed copies of the databus repo's stale top-level docs, verified against databus `main` @ `1be2da1` (2026-10-20). Source in the repo wins over any doc. The originals in the databus repo are untouched.

# Databús

A distributed transit data system implementing GTFS Schedule and GTFS Realtime. A Django control plane plus Celery workers ingest vehicle telemetry (MQTT, and polled HTTP sources), keep authoritative real-time state in Redis, and publish GTFS-RT VehiclePositions and TripUpdates every 15 s plus a GTFS Schedule zip.

## Services (Docker Compose)

| Service | Role | Tech |
|---|---|---|
| `orchestrator` | Control plane: REST API, admin, run commands, Channels status push | Django / Daphne (ASGI) |
| `realtime-engine` | Telemetry consumer (MQTT bootstep), `process_position_update`, lifecycle events, `fetch_positions`, `scan_stale_runs` | Celery worker, queue `realtime_engine` |
| `schedule-engine` | Builds GTFS-RT feeds and the Schedule zip | Celery worker, queue `schedule_engine` |
| `scheduler` | Fires periodic tasks per the in-code schedule | Celery Beat |
| `user-interface` | Frontend | Nuxt (dev port `USER_INTERFACE_PORT`, default 3000) |
| `database` | Durable persistence | PostgreSQL + PostGIS |
| `state` | Authoritative real-time state | Redis 7 |
| `message-broker` | Celery broker; `databus.events` exchange | RabbitMQ 4 |
| `telemetry-broker` | Vehicle telemetry ingestion | NanoMQ (anonymous, TCP 1883) |
| `analytics-engine` | Batch/ML (placeholder: `analytics.py` is empty) | Prefect 3 |
| `task-monitoring` | Celery dashboard | Flower |
| `docs` | Built docs site (prod only) | nginx |

## Getting started

```bash
git clone https://github.com/simovilab/databus.git
cd databus
cp .env.example .env     # edit values
./scripts/dev.sh         # pulls images, builds, `up --build -d --remove-orphans`, waits for health
```

`docker-entrypoint.sh` clones `gtfs-io`, `gtfs-django` and `gtfs-eta` into `backend/` if missing (there is no `.gitmodules` and no submodule step). In dev, `MQTT_CONSUMER_ENABLED=true` is set inline in `compose.dev.yml`.

Dev URLs: API/admin on `BACKEND_PORT` (8000), Flower `TASK_MONITORING_PORT` (5555), RabbitMQ UI `MESSAGE_BROKER_MANAGEMENT_PORT` (15672), Prefect `ANALYTICS_PORT` (4200), UI `USER_INTERFACE_PORT` (3000).

## Production

`./scripts/prod.sh` uses `compose.prod.yml`: no host ports are published; an **external** Traefik on the `traefik_proxy` network (created by `prod.sh` if missing) routes by `*_DOMAIN` env vars; MQTT is exposed through a TLS TCP router on 8883. `DB_PASSWORD` and `REDIS_PASSWORD` are required. **`MQTT_CONSUMER_ENABLED` is not set in prod compose and defaults to false** — set it for `realtime-engine` or no MQTT telemetry is consumed.

## Development commands

`make lint` (ruff, local), `make typecheck` (mypy in `orchestrator`), `make test` (pytest in `orchestrator`). The only GitHub workflow deploys the docs site; there is no lint/test CI.

## Layout

`backend/` (Django project `databus` + apps `api`, `runs`, `realtime_engine`, `schedule_engine`, `feed`, `operations`, `website`, `messages`; nested clones `gtfs-django`, `gtfs-io`; `gtfs-eta`, an orphan gitlink with no `.gitmodules` entry), `database/`, `state/` (empty `redis.conf`), `telemetry-broker/nanomq.conf`, `message-broker/rabbitmq.conf`, `analytics-engine/`, `frontend/`, `docs/`, `scripts/`.

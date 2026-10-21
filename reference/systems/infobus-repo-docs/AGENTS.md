# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

**Infobús** is a real-time public transportation information system for Costa Rica, developed at Universidad de Costa Rica (UCR). It consumes GTFS Schedule and Realtime feeds published by Databús, tracks vehicle runs, and delivers live transit information through a read-only REST API and topic-based WebSocket updates. It never produces GTFS-RT itself.

**Tech Stack:** Django 6+, Python 3.14+, Nuxt 4, PostgreSQL 18/PostGIS 3, Redis 8, RabbitMQ 4, Celery, Django Channels, FastMCP, Apache Jena Fuseki, Docker

**Maturity:** The backend (feed ingestion, runs, WebSocket updates, REST API) is functional. The Nuxt frontend is still the Nuxt UI dashboard template with mock data, `context/` exposes a single `greet` tool, and `knowledge/` is an empty Fuseki instance. There are no screen models and no weather, social or CAP fetchers.

## Architecture

### Services (Docker Compose)

1. **orchestrator** (Django / Daphne ASGI) — REST API, admin, website, WebSocket `/ws/updates/`
   - Django apps: `feed`, `engine`, `runs`, `updates`, `api`, `website` (plus the external `gtfs` package)
   - Located in: `backend/`

2. **engine** (Celery worker) — Feed ingestion, run lifecycle, Parquet export, data purge
   - Located in: `backend/` (same codebase, different entrypoint)

3. **scheduler** (Celery Beat) — Periodic task scheduling (schedule is hardcoded in `backend/infobus/celery.py`)
   - Located in: `backend/`

4. **streams-consumer** (`python -m updates.client`) — Reads the Redis stream `events`, builds projections, pushes snapshots to WebSocket clients via the Channels layer
   - Located in: `backend/`

5. **user-interface** (Nuxt) — Web frontend (template with mock data; no backend calls yet)
   - Located in: `frontend/`

6. **context** (FastMCP) — MCP tool server (stub)
   - Located in: `context/`

7. **knowledge** (Apache Jena Fuseki) — SPARQL / knowledge graph (empty dataset)
   - Located in: `knowledge/`

8. **docs** (nginx, production only) — Serves the built documentation from `docs/site`

### Infrastructure Services

- **database** — PostgreSQL 18 with PostGIS 3 (durable persistence; built from `database/`)
- **memory** — Redis 8, password-protected (Celery broker, Channels layer, run state, `events` stream, cache)
- **broker** — RabbitMQ 4 (provisioned; not the Celery broker)

### Key Dependencies

GTFS models come from the `gtfs-django` and `gtfs-io` packages, declared as a uv workspace in `backend/pyproject.toml`. They are not git submodules and are not committed: `backend/docker-entrypoint.sh` clones `simovilab/gtfs-io` and `simovilab/gtfs-django` into `backend/` at container start. To import the backend outside a container, clone both repos into `backend/` yourself.

## Development Commands

### Quick Start

```bash
./scripts/dev.sh  # builds, starts, and waits for all services
```

### Common Tasks

```bash
# Logs
docker compose -f compose.dev.yml logs -f
docker compose -f compose.dev.yml logs -f orchestrator

# Django management
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py migrate
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py createsuperuser
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py shell
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py collectstatic

# Data retention (dry run by default) and run reconciliation (report only by default)
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py purge_old_data
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py reconcile_active_runs

# Stop
docker compose -f compose.dev.yml down
```

### Code Quality

```bash
# From backend/
ruff check .
ruff format .
pytest
```

### Accessing Services

- Orchestrator / API: http://localhost:8000
- Django Admin: http://localhost:8000/admin (admin/admin, created when `DEBUG=True`)
- API docs (Redoc): http://localhost:8000/api/docs/
- Nuxt frontend: http://localhost:3000
- RabbitMQ Management: http://localhost:15672 (guest/guest)
- Fuseki SPARQL: http://localhost:3030
- MCP Context: http://localhost:3278

## Production Deployment

Production uses Traefik as reverse proxy with Let's Encrypt TLS. All traffic via port 443; no service publishes host ports.

```bash
./scripts/prod.sh
```

Compose file: `compose.prod.yml`

### Production Management

```bash
docker compose -f compose.prod.yml logs -f
docker compose -f compose.prod.yml exec orchestrator uv run python manage.py migrate
docker compose -f compose.prod.yml exec orchestrator uv run python manage.py createsuperuser
docker compose -f compose.prod.yml build && docker compose -f compose.prod.yml up -d
docker compose -f compose.prod.yml down
```

## Django Apps (backend/)

- **feed** — GTFS Schedule and Realtime models (subclassing `gtfs-django`), `TransitSystem`, `FeedPublisher` (feed URLs live here, edited in admin), schedule import, Parquet export, `purge_old_data` command
- **engine** — Celery tasks (`engine/tasks.py`), `InfoProvider` / `InfoService` models
- **runs** — `Run` model, lifecycle state machine, Redis-backed active-run state, `reconcile_active_runs` command
- **updates** — Redis-stream consumer, builders and projections, topic subscriptions, WebSocket consumer (`ws/updates/`); also skeleton `Weather`, `CommonAlert`, `Social` models with no fetchers
- **api** — Read-only DRF ViewSets, rate limiting, OpenAPI docs (`api/infobus.yml` is hand-written)
- **website** — Template pages (`/`, `/sobre/`, `/perfil/`, `/updates/` WebSocket test page), user profile

### Background Tasks

Scheduled in `backend/infobus/celery.py` (not in Django admin):

- `get_schedule` — hourly at minute 30: import new GTFS Schedule per active `FeedPublisher`
- `update_gtfs_realtime` — every 30 s: group of `get_vehicle_positions`, `get_trip_updates`, `get_alerts`
- `evaluate_run_lifecycles` — every 60 s
- `save_gtfs_realtime` — hourly at minute 0: group of `save_vehicle_positions`, `save_stop_time_updates` (Parquet)
- `purge_old_data` — daily at 03:15

### WebSocket Updates

- Single endpoint: `ws/updates/` (no authentication wrapper)
- Client sends `{"action": "subscribe" | "unsubscribe", "topic": "..."}`
- Topic format: `transit_system.entity.info.selector.value[.qualifier_selector.qualifier_value]`

## Environment Configuration

Required variables in `.env` (see `.env.example` for the full list):

- Django: `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`
- Database: `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`
- Redis: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_CELERY_DB`, `REDIS_CACHE_DB`
- RabbitMQ: `RABBITMQ_USER`, `RABBITMQ_PASS`, `RABBITMQ_HOST`, `RABBITMQ_PORT`
- API limits: `DRF_THROTTLE_ANON_RATE`, `DRF_THROTTLE_GEOMETRY_RATE`, `DRF_THROTTLE_REALTIME_RATE`, `DRF_PAGE_SIZE`
- Retention: `REALTIME_RETENTION_DAYS`, `SCHEDULE_RETENTION_DAYS`, `PARQUET_RETENTION_DAYS`, `PURGE_BATCH_SIZE`
- macOS only: `GDAL_LIBRARY_PATH`, `GEOS_LIBRARY_PATH` (for PostGIS)

Files:

- `.env` — Base configuration (not in git)
- `.env.dev` — Development overrides (tracked)
- `.env.prod` — Production overrides (tracked)
- `.env.example` — Template

## Important Notes

- **No GTFS-RT production**: Infobús only consumes GTFS-RT; never add protobuf feed generation
- **Feed URLs are DB rows**: Configure upstream feeds as `FeedPublisher` records, not env vars
- **GTFS packages**: `gtfs-io` / `gtfs-django` are cloned by the container entrypoint, not submodules
- **Package manager**: Uses `uv` for Python and `pnpm` for the frontend
- **Timezone**: `America/Costa_Rica` (es-cr locale)
- **Service names in Docker**: Use compose service names (`database`, `memory`, `broker`) not `localhost` for inter-service communication
- **Compose files**: `compose.dev.yml` (development), `compose.prod.yml` (production)
- **Production proxy**: Traefik (external container on `traefik_proxy` network), not Nginx
- **Public API**: Default permission is `AllowAny`; endpoints are read-only and throttled
- **Tests**: Per-app `tests.py` files (`updates` is the largest). Use pytest for new tests

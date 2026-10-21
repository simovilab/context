---
name: infobus
description: Skill for working inside the infobus repo — SIMOVI's passenger-facing real-time transit information platform (Django 6 + GTFS consumer + Redis-stream WebSocket push; Nuxt UI, FastMCP and Fuseki are still scaffolds). Load when working on any infobus service. Verified against the repo's main branch (commit 8c79fd5) on 2026-10-20.
---

# Skill: infobus

Load when working inside the `infobus` repo or on anything that displays or distributes transit information to passengers: the REST API, WebSocket `updates`, run lifecycle, Celery ingestion, compose/deploy, or the `context/` and `knowledge/` services.

Longer narrative lives in `reference/systems/infobus.md` of the SIMOVI `context` repo (locally `/Users/dotj/Desktop/SIMOVI/git.no_sync/context/reference/systems/infobus.md`) — read it when you need flows, models or the compose table in more depth. Where any doc disagrees with the source code, the code wins. The infobus repo's `AGENTS.md`, `README.md`, `ARCHITECTURE.md` and `scripts/README.md` were refreshed in October 2026 to match; older clones may still carry the stale versions (see "Known stale docs").

## What it is

infobus consumes GTFS Schedule + GTFS-Realtime feeds published by `databus`, stores them, tracks vehicle "runs", and pushes topic-based snapshots to clients over WebSocket plus a read-only REST API. It is the experience/enrichment layer; `databus` is the producer.

## Key invariants

- **infobus NEVER produces GTFS-RT.** Only `ParseFromString` exists (in `engine/tasks.py`); no `SerializeToString` outside tests. Do not add protobuf feed generation.
- **No databus URL in env or settings.** Upstream feed URLs are stored in the DB on `feed.FeedPublisher` rows (`schedule_url`, `trip_updates_url`, `vehicle_positions_url`, `alerts_url`) and edited via admin.
- **GTFS base models come from the `gtfs` package, not a submodule.** There is no `.gitmodules` and no `backend/gtfs`. `backend/pyproject.toml` declares a uv workspace (`gtfs-io`, `gtfs-django`, editable). `docker-entrypoint.sh` clones `simovilab/gtfs-io` and `simovilab/gtfs-django` into `backend/` at container start (git-ignored). `feed/models.py` does `from gtfs.models import ...` and subclasses the `Base*` models. Outside the container the code is not importable unless those dirs exist.
- **Celery Beat schedule is hardcoded** in `backend/infobus/celery.py` (`app.conf.beat_schedule`), not managed in Django admin. `django_celery_beat` is installed but no DB scheduler is configured. Change schedules in code.
- **Celery broker is Redis** (`CELERY_BROKER_URL`, DB `REDIS_CELERY_DB`), results in `django-db`. RabbitMQ (`broker`) is deployed but not the Celery broker. No queue routing: everything uses the default queue.
- **Redis requires a password** (`REDIS_PASSWORD`); credentials must be passed to Celery, the channel layer and every direct Redis client (recent fixes touched all three). Prod compose fails if it's unset.
- **WebSockets need ASGI** (Daphne in prod, `runserver` in dev handles it via daphne in INSTALLED_APPS). Route: `ws/updates/` only. The consumer has no auth wrapper.
- **Use compose service names** between containers: `DB_HOST=database`, `REDIS_HOST=memory`, `RABBITMQ_HOST=broker`, `orchestrator`, `context`, `knowledge`.
- **Public API is read-only and rate-limited**; default permission is `AllowAny` (the `IsAuthenticated` lines in views are commented out). TokenAuthentication is configured but not enforced.
- **Dev superuser `admin/admin`** is created by the entrypoint when `DEBUG=True` and `DJANGO_SETUP=True`. Never in prod.
- **Package managers:** `uv` for Python (`uv run ...`), `pnpm` for the frontend. Python `>=3.14`, Django `>=6.0.4` (not 3.12/5.2 as AGENTS.md says).
- **Timezone** `America/Costa_Rica`, es-cr locale.

## Services (compose.dev.yml, project `infobus-dev`)

| Service | Build/image | Port | Notes |
|---|---|---|---|
| orchestrator | `backend`, target `dev` (prod: `daphne infobus.asgi:application`) | 8000 | Only service with `DJANGO_SETUP=True` (migrate, collectstatic, fixtures). Volumes: `./backend`, `backend_venv`, `lake_data` |
| engine | `backend`, target `engine` | – | `celery -A infobus worker` |
| scheduler | `backend`, target `scheduler` | – | `celery -A infobus beat` |
| streams-consumer | `backend`, target `streams-consumer` | – | `python -m updates.client` — reads Redis stream `events` and pushes to channel layer. **Easy to forget; missing from AGENTS.md/README** |
| database | `database/` (postgres 18.3 + PostGIS 3) | none published | trust auth in dev |
| memory | redis 8 (8.10.1 prod), appendonly, requirepass | 6379 | cache, channel layer, Celery broker, event streams |
| broker | rabbitmq 4 mgmt (4.3.5 prod) | 5672/15672/15692 | dev vars `RABBITMQ_DEFAULT_*`; prod uses `RABBITMQ_USER/PASS`; no Traefik router |
| context | `context/` FastMCP | 3278 | **stub** (see below); `context_venv` volume dev only |
| knowledge | `knowledge/` Jena Fuseki 5.3 | 3030 | **empty** TDB2 dataset `/ds`, bind-mounted dirs |
| user-interface | `frontend/` Nuxt, target `dev` | 3000 | **template with mock data** |

Prod (`compose.prod.yml`, project `infobus-prod`): no host ports, `restart: unless-stopped`, `no-new-privileges`, networks `internal` + external `traefik_proxy`, Traefik v-hosts via `${ORCHESTRATOR_DOMAIN}`, `${UI_DOMAIN}`, `${CONTEXT_DOMAIN}`, `${KNOWLEDGE_DOMAIN}`, `${DOCS_DOMAIN}`, cert resolver `${CERT_RESOLVER:-letsencrypt}`. Prod-only `docs` service (nginx serving `./docs/site`). `./scripts/prod.sh` creates `traefik_proxy` if missing. `./scripts/dev.sh` builds/starts/waits.

CI: only `.github/workflows/docs.yml` (Zensical → GitHub Pages). No test/lint/image workflows.

## Backend apps (`backend/`, project package `infobus/`)

INSTALLED_APPS order: daphne, channels, `gtfs`, `feed`, `website`, `engine`, `runs`, `api`, `updates`, DRF (+authtoken, drf_spectacular), django_celery_results/beat, `django.contrib.gis`, django_filters. **There is no `alerts` app and no Screen model.**

- **feed** — GTFS Schedule + RT storage. Subclasses gtfs models (Agency, Stop, Route, Calendar, CalendarDate, Shape, Trip, StopTime, Fare*, FeedInfo) and RT models (TripUpdate, StopTimeUpdate, VehiclePosition, Alert, EntitySelector, TimeRange, Translated*). Infobus-specific: `TransitSystem`, `FeedPublisher`, `Feed` (schedule ETag/validity/is_current), `FeedMessage`, `GeoShape`, `RouteStop`, `TripDuration`, `TripTime`. Geo: `Stop.stop_point`, `VehiclePosition.position_point` (srid 4326), `GeoShape.geometry`. `services/` has schedule import (atomic, per-publisher failure isolation), realtime persistence, queries, Parquet export. Command: `purge_old_data` (dry run by default). `feed/urls.py` is empty/not included.
- **engine** — Celery tasks (`engine/tasks.py`) + models `InfoProvider`, `InfoService` (`type`: website, screens, analysis, app, chatbot, social, other — this is where "screens" exist today).
- **runs** — `Run` model, lifecycle state machine (`domain/lifecycle`), Redis-backed active sets, event detection. Command: `reconcile_active_runs` (`--apply`, `--minimum-age-minutes`, `--allow-empty-canonical`).
- **updates** — realtime push layer: Redis stream `events` (group `updates`, dead letter `events:dead-letter`) → `builders/`, `projections/`, `planner.py`, `dispatcher.py`, `subscriptions.py`, `registry.py` → `UpdatesConsumer` (`updates/consumers.py`, sync). Topic format `transit_system.entity.info.selector.value[.qualifier_selector.qualifier_value]` (`updates/topics.py`). Registered topics: trip/stop occupancy_status, stop stop_time_updates, route vehicle_positions (plain + by direction); alert/congestion builders exist. Client messages `{"action":"subscribe"|"unsubscribe","topic":...}`; server sends `connected`, `subscribed`, `unsubscribed`, `error`, `{topic,message}`. Also models `Weather`, `CommonAlert` (stub, id only), `Social` — **skeletons with no fetchers, tasks, or API**.
- **api** — DRF, read-only `DefaultRouter` under `/api/`: info-services, feed-publishers, agencies, stops, geo-stops, shapes, geo-shapes, routes, calendars, calendar-dates, trips, stop-times, fare-attributes, fare-rules, feed-info; APIViews `next-trips/`, `next-stops/`, `route-stops/`; `docs/` (Redoc), `docs/schema/` (serves hand-written `api/infobus.yml`, not the generated schema), `api-auth/`. RT ViewSets in `views.py` are defined but **not registered**. Throttles in `api/throttling.py` fail open on Redis errors.
- **website** — Django templates: `/`, `/sobre/`, `/perfil/`, `/updates/` (WebSocket test page). Plus `health/` and `admin/` at the root.

### Celery tasks and beat (`infobus/celery.py`)

| Beat entry | Task | Schedule |
|---|---|---|
| update-gtfs-schedule | `get_schedule` | minute 30 hourly |
| update-gtfs-realtime | `update_gtfs_realtime` (group: `get_vehicle_positions`, `get_trip_updates`, `get_alerts`) | every 30 s |
| evaluate-run-lifecycles | `evaluate_run_lifecycles` | every 60 s |
| save-gtfs-realtime | `save_gtfs_realtime` (group: `save_vehicle_positions`, `save_stop_time_updates` → GeoParquet/Parquet in `lake_data`) | hourly, minute 0 |
| purge-old-data | `purge_old_data` | daily 03:15 |

The old `get_weather` / `get_social_feed` / `get_cap_alerts` tasks no longer exist.

### Key env vars (names only; template is `.env.example`)

Django: `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `DJANGO_SUPERUSER_*`. DB: `DB_NAME/USER/PASSWORD/HOST/PORT`. Redis: `REDIS_HOST/PORT/PASSWORD`, `REDIS_CELERY_DB`, `REDIS_CACHE_DB`. Throttle/API: `DRF_THROTTLE_ANON_RATE` (60/min), `DRF_THROTTLE_GEOMETRY_RATE` (10/min), `DRF_THROTTLE_REALTIME_RATE` (30/min), `DRF_PAGE_SIZE` (100), `DRF_NUM_PROXIES`, `HTTP_REQUEST_TIMEOUT_SECONDS`. Streams: `REDIS_EVENTS_STREAM_MAXLEN`, `REDIS_DEAD_LETTER_STREAM_MAXLEN`. Retention: `REALTIME_RETENTION_DAYS`, `SCHEDULE_RETENTION_DAYS`, `PARQUET_RETENTION_DAYS`, `PURGE_BATCH_SIZE`. Also `RUN_*`, `GTFS_RT_*_TOLERANCE_SECONDS`, `SECURE_SSL_REDIRECT`, `SECURE_HSTS_SECONDS` (not in the template). macOS only: `GDAL_LIBRARY_PATH`, `GEOS_LIBRARY_PATH`. `.env` is the base; `.env.dev` / `.env.prod` are tiny overlays (`DEBUG`, `DJANGO_SERVE_STATIC`, dev also `GTFS_DJANGO_DEV`). `MQTT_DOMAIN`, `NANOMQ_LOG_LEVEL` and `API_TOKEN` in the template match nothing live.

## Scaffold-only services (don't assume features exist)

- **frontend/** — Nuxt ^4.4, Nuxt UI ^4.6, Tailwind 4, pnpm 10. Still the Nuxt UI dashboard template: pages `index`, `inbox`, `customers`, `settings/*`; `server/api/*` return hardcoded mocks. **No backend client, no WebSocket code, no runtimeConfig**; `NUXT_PUBLIC_API_BASE` is set in compose but unread.
- **context/** — FastMCP `>=3.1`, Python 3.14, HTTP transport on `CONTEXT_PORT` (3278). One tool: `greet(name)`. No resources, no prompts, queries nothing.
- **knowledge/** — stock Jena Fuseki. No ontologies, no data-load scripts; the dataset is created empty by the compose command.
- **database/** — Dockerfile + entrypoint that enables PostGIS; no schema (Django owns it).
- **docs/** — Zensical site (`docs/content/*.md`: architecture, django-applications, runs-lifecycle, updates-websockets, gtfs-realtime, gtfs-schedule, api-openapi, deployment-operations, decisions-limitations, testing, local-development, concepts). `docs/old/` is legacy MkDocs.

## Common commands

```bash
./scripts/dev.sh
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py migrate
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py purge_old_data           # dry run
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py reconcile_active_runs    # report only
cd backend && uv run pytest        # tests are per-app tests.py (updates ~2.1k lines); ruff is a dev dep
```

## Known stale docs in the infobus repo

- `AGENTS.md` / `README.md`: gtfs "Git submodule" + `git submodule update` (no longer true); `alerts` app; "Redis 7", "PostgreSQL 16 / PostGIS 3.4" (actually Redis 8, Postgres 18.3); Redis described as the only Celery-related piece while RabbitMQ is listed as broker; Python 3.12/Django 5.2; weather/social/CAP tasks; missing `streams-consumer`, `runs`, `updates`, prod `docs`; README `/api/alerts/` and `/ws/alerts/` (real WS route is `ws/updates/`).
- `scripts/README.md`: describes Nginx, `docker-compose.production.yml`, `.env.local` — prod is Traefik + `compose.prod.yml` + `.env.prod`.
- `ARCHITECTURE.md`: mermaid only; shows OTP/GraphQL/SSE/NanoMQ that aren't in compose.
- `README.md` prod table lists `BROKER_DOMAIN`, but the broker has no Traefik router.

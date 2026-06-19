# AGENTS.md

This file provides guidance to AI agents working in this repository.

## Project overview

Databús is a distributed transit data system implementing GTFS Schedule and GTFS Realtime specifications. The system consists of multiple services coordinated via message brokers, with a Django backend as the control plane and separate Python services for real-time processing and feed generation.

**Tech Stack:** Django 5.2+, Python 3.14, PostgreSQL/PostGIS, Redis, RabbitMQ, MQTT, Celery, Docker, uv

## System context

For the canonical architecture, services, message broker semantics, state management, and data flow, see [`context/reference/systems/databus.md`](https://github.com/simovilab/context/blob/main/reference/systems/databus.md).

For naming conventions across processes, states, events, actions, and messages, see [`context/reference/domain/naming.md`](https://github.com/simovilab/context/blob/main/reference/domain/naming.md).

For GTFS spec essentials, see [`context/reference/domain/gtfs.md`](https://github.com/simovilab/context/blob/main/reference/domain/gtfs.md).

For state machines and process specs, see [`context/behavior/databus/`](https://github.com/simovilab/context/tree/main/behavior/databus).

If you have the `context/` repo cloned alongside `databus/`, prefer relative paths (`../context/...`).

## Development commands

### Initial setup

```bash
# Docker-based development (recommended)
./scripts/dev.sh
```

### Running services

```bash
./scripts/dev.sh                                          # Start all services
docker compose -f compose.dev.yml logs -f                 # All logs
docker compose -f compose.dev.yml logs -f orchestrator    # Single service
docker compose -f compose.dev.yml down                    # Stop
```

### Database operations

```bash
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py makemigrations
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py migrate
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py shell
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py createsuperuser
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py update_foreign_keys
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py loaddata gtfs.json
```

### Code quality

```bash
cd backend
ruff check . && ruff format .
mypy .
pytest tests/ -v
```

### Accessing services

| Service | URL |
|---|---|
| Orchestrator | http://localhost:8000 |
| Django Admin | http://localhost:8000/admin |
| API Root | http://localhost:8000/api/ |
| API Docs | http://localhost:8000/api/docs/ |
| RabbitMQ Management | http://localhost:15672 (guest/guest) |
| Prefect Analytics | http://localhost:4200 |
| Flower (task monitoring) | http://localhost:5555 |

## Environment configuration

Required variables in `.env`:

- Django: `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`
- Database: `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`
- Redis: `REDIS_HOST`, `REDIS_PORT`
- macOS only: `GDAL_LIBRARY_PATH`, `GEOS_LIBRARY_PATH`

Files: `.env` (local secrets, not in git), `.env.dev` (tracked), `.env.prod` (tracked), `.env.example` (template)

## Important notes

- **Package manager:** uses `uv`, not pip directly
- **Timezone:** `America/Costa_Rica` (es-cr locale)
- **GTFS package:** GTFS Schedule models come from `gtfs-django`, a `uv` workspace package (editable, alongside `gtfs-io`) providing the `gtfs` app — first in `INSTALLED_APPS`. Previously a git submodule; there is no `.gitmodules` today. Toggling the editable workspace package may require removing the `backend_venv` Docker volume.
- **Service names in Docker:** use compose service names (`orchestrator`, `realtime-engine`, `schedule-engine`, `scheduler`, `database`, `state`, `message-broker`, `telemetry-broker`), not `localhost` for inter-service communication
- **Tests:** minimal coverage currently; use pytest with pytest-django for new tests
- **Celery beat schedule:** configured **in code** in `backend/databus/celery.py` (the `beat_schedule`), **not** via `django_celery_beat` admin or crontab. Two queues: `realtime_engine` and `schedule_engine`.
- **MQTT consumer:** a Celery bootstep inside `realtime-engine`, gated by `MQTT_CONSUMER_ENABLED` (single subscriber); not a standalone process. Subscribes only to `position`/`occupancy` — edge `progression` is ignored.
- **State vs persistence:** real-time decisions use Redis state (sole writer: `realtime-engine`); PostgreSQL is for durability and analytics only. Canonical Redis keys live in `backend/runs/domain/telemetry/keys.py`.
- **AMQP eventing is a stub:** `backend/messages/publisher.py` `publish_event` only `print()`s today — treat RabbitMQ command/observation/assertion messaging as intended design, not current behavior.

## Common patterns

### Adding a new Celery task

1. Define the task in the appropriate app (`backend/schedule_engine/` for GTFS-RT generation; `backend/realtime_engine/` for telemetry processing and periodic scans like `scan_stale_runs`)
2. Route it to the correct queue (`schedule_engine` or `realtime_engine`)
3. If periodic, add it to the `beat_schedule` in `backend/databus/celery.py`; otherwise invoke with `.delay()` / `.apply_async()`

### Working with real-time state

```python
import redis
r = redis.Redis(host='state', port=6379, decode_responses=True)

runs = r.smembers('runs:in_progress')
run = r.hgetall(f'run:{run_id}')
position = r.hgetall(f'vehicle:{vehicle_id}:position')
```

### Adding a new API endpoint

1. Define model in appropriate Django app
2. Create ViewSet in `backend/api/views.py`
3. Register router in `backend/api/urls.py`
4. Document with drf-spectacular decorators

### Debugging the realtime pipeline

1. Trace the live path: MQTT (`telemetry-broker`) → `realtime-engine` MQTT bootstep → Redis (`state`) → `process_position_update` → `schedule-engine` feed build → `backend/feed/files/`
2. Inspect Redis state directly (`vehicle:<id>:position`, `run:<id>:vehicle_stop_status`, `runs:tracking`)
3. Watch Celery via Flower: http://localhost:5555
4. Check service logs: `docker compose -f compose.dev.yml logs -f <service>`
5. RabbitMQ management UI (http://localhost:15672) is available, but AMQP domain-event publishing is currently stubbed — most run flow is Redis + Celery, not AMQP messages

## Documentation

- `docs/content/` — **The Zensical documentation site (current source of truth).** As-built architecture, data flow, run lifecycle, data model, interfaces, and operations. Build with `cd docs && uv run zensical build`.
- `ARCHITECTURE.md` — Service mandates and principles (historical intent; valid as design rationale, but **source wins** on specifics)
- `MODEL.md` — Functional diagrams, motion FSM, run lifecycle (historical intent — note the motion FSM is not implemented as drawn)
- `AGENTS.md` — This file
- Legacy root docs (`docs/api.md`, `docs/development.md` (Spanish), `docs/deployment.md` (systemd), `docs/old/*`) are **retired** — mine for history only; the live `docs/content/` site supersedes them.

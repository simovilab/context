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
- **GTFS package:** uses `gtfs-django` PyPI package (previously was a git submodule — no longer)
- **Service names in Docker:** use compose service names (`database`, `state`, `message-broker`, `telemetry-broker`), not `localhost` for inter-service communication
- **Tests:** minimal coverage currently; use pytest with pytest-django for new tests
- **Celery tasks:** configured via Django admin at `/admin/django_celery_beat/`, not crontab
- **State vs persistence:** real-time decisions use Redis state; PostgreSQL is for durability and analytics only

## Common patterns

### Adding a new Celery task

1. Define task in appropriate app (`backend/schedule_engine/` for GTFS-RT generation, `backend/periodic_engine/` for periodic tasks)
2. Register in Celery app configuration
3. Schedule via Django admin if periodic, or invoke manually/on-demand

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

### Debugging message flow

1. Check RabbitMQ management UI: http://localhost:15672
2. View queue depths, message rates, bindings
3. Trace messages: orchestrator → message-broker → realtime-engine
4. Check service logs: `docker compose -f compose.dev.yml logs -f <service>`

## Documentation

- `ARCHITECTURE.md` — Detailed service mandates and principles (AUTHORITATIVE — respect before structural changes)
- `MODEL.md` — Functional diagrams, vehicle FSM, run lifecycle
- `AGENTS.md` — This file
- `docs/development.md` — Functional notes (Spanish)
- `docs/deployment.md` — Production systemd setup
- `docs/api.md` — API specifications

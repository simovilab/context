# AGENTS.md

This file provides guidance to AI agents working in this repository.

## Project overview

Infobús is SIMOVI's passenger-facing real-time transit information platform. It consumes GTFS Schedule and Realtime feeds produced by Databús and projects them onto digital displays at bus stops and stations (Raspberry Pi kiosks), REST and GraphQL APIs, WebSocket/SSE streams for live updates, an MCP server for contextual queries, and a SPARQL knowledge graph. The system enriches transit data with weather, social feeds, and CAP emergency alerts. Built on Django + Celery + Nuxt, deployed via Docker Compose.

**Tech Stack:** Django 5.2+, Python 3.12+ (context service: 3.14+), PostgreSQL/PostGIS, Redis, RabbitMQ, Celery, Django Channels (ASGI/Daphne), FastMCP, Apache Jena Fuseki, Nuxt UI, Docker, uv

## System context

For the canonical architecture, services, and data flow, see [`context/reference/systems/infobus.md`](https://github.com/simovilab/context/blob/main/reference/systems/infobus.md).

For naming conventions across processes, states, events, actions, and messages, see [`context/reference/domain/naming.md`](https://github.com/simovilab/context/blob/main/reference/domain/naming.md).

For GTFS spec essentials, see [`context/reference/domain/gtfs.md`](https://github.com/simovilab/context/blob/main/reference/domain/gtfs.md).

For state machines and process specs, see [`context/behavior/infobus/`](https://github.com/simovilab/context/tree/main/behavior/infobus).

If you have the `context/` repo cloned alongside `infobus/`, prefer relative paths (`../context/...`).

## Development commands

### Quick start

```bash
./scripts/dev.sh
```

### Logs

```bash
docker compose -f compose.dev.yml logs -f
docker compose -f compose.dev.yml logs -f orchestrator
docker compose -f compose.dev.yml logs -f engine
```

### Django management

```bash
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py migrate
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py createsuperuser
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py shell
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py test
```

### Code quality

```bash
cd backend
ruff check . && ruff format .
```

### Stop

```bash
docker compose -f compose.dev.yml down
```

## Accessing services

| Service | URL |
|---|---|
| Website / Admin | http://localhost:8000 |
| API | http://localhost:8000/api/ |
| MCP (context) | http://localhost:3278 |
| SPARQL (knowledge) | http://localhost:3030 |
| Frontend (user-interface) | http://localhost:3000 |
| RabbitMQ UI | http://localhost:15672 |
| Production (via Nginx) | http://localhost/health/ |

Default dev admin: `admin` / `admin` — never use in production.

## Git submodules

The `gtfs` git submodule was replaced by the `gtfs-django` PyPI package (commit b34a290). GTFS models now live in the `feed` Django app. If any other submodules remain, run `git submodule update --init --recursive` after clone/pull.

## Testing & quality

```bash
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py test
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py test alerts
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py test engine
cd backend && ruff check . && ruff format .
```

## Environment configuration

Inter-container hostnames (never `localhost` between services):
```
DB_HOST=database
REDIS_HOST=memory
# RabbitMQ: broker
# MCP server: context
# SPARQL: knowledge
# Backend (from UI): orchestrator
```

Env file layering: `.env` (base, committed, no secrets) → `.env.dev` (dev overrides, committed) → `.env.prod` (prod template) → `.env.local` (local secrets, git-ignored)

macOS PostGIS: `GDAL_LIBRARY_PATH=...`, `GEOS_LIBRARY_PATH=...`

## Important notes

- **infobus NEVER produces GTFS-RT** — only consumes from databus. Never write feed-generation code here.
- **Screens have PostGIS `Point` coordinates** — always query via spatial filters, not string matching.
- **GTFS models live in the `feed` app** (`gtfs-django` PyPI package) — import from `feed`, not from any shim.
- **Celery Beat schedule** is in Django admin, not hardcoded in settings.
- **WebSocket endpoints** (`/ws/`) need Daphne/ASGI — don't fall back to WSGI `runserver`.
- **`context/` service** is a FastMCP server (port 3278) — separate from the Django `orchestrator`.
- **`knowledge/` service** is Apache Jena Fuseki with TDB2 (port 3030) — SPARQL endpoint at `/ds`.

## Troubleshooting

```bash
# Rebuild containers
docker compose -f compose.dev.yml up --build

# Reset volumes (WARNING: deletes data)
docker compose -f compose.dev.yml down -v

# Migration issues
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py migrate --fake <app> zero
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py makemigrations <app>
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py migrate
```

## Production deployment

```bash
./scripts/prod.sh
```

Production adds Nginx reverse proxy (rate limiting, security headers, SSL-ready). See `compose.prod.yml`.

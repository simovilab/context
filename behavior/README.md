---
name: infobus
description: Skill for working inside the infobus repo — SIMOVI's passenger-facing real-time transit information platform built on Django + GTFS. Load when working on any infobus service. Sourced from README.md, ARCHITECTURE.md, AGENTS.md, compose.dev.yml, backend/ layout (as of 2026-04-22).
---

# Skill: infobus

**Role in bUCR**: Passenger-facing information layer. Consumes GTFS Schedule + Realtime feeds (produced by `databus`) via HTTP polling and projects them onto many surfaces: digital displays at bus stops/stations (Raspberry Pi kiosks), REST + GraphQL APIs, WebSockets + SSE for live updates, MCP + SPARQL for contextual/knowledge-graph queries, and computational services (ETA, trip planning via OTP). Enriches transit data with weather, social feeds, and CAP emergency alerts.

> `databus` = data producer (authoritative truth). `infobus` = experience + enrichment layer (display/API/context). They are stacked, not parallel.

---

## Current Repo Structure (2026-04-22)

```
infobus/
├── backend/                    # Unified Django + Celery codebase (like databus/backend)
│   ├── Dockerfile              # Multi-stage (dev/prod/worker targets)
│   ├── docker-entrypoint.sh    # Shared venv lock, DB wait, migrate, loaddata
│   ├── manage.py
│   ├── pyproject.toml / uv.lock
│   ├── infobus/                # Django project (settings, ASGI, Celery app)
│   ├── alerts/                 # Screen management + WebSocket real-time display
│   ├── api/                    # DRF REST endpoints
│   ├── engine/                 # Information service providers + WebSocket consumers
│   ├── website/                # Main site + user management
│   ├── gtfs_compat.py          # Compat shim around gtfs-django PyPI package
│   └── static/ staticfiles/ data/ media/
│
├── context/                    # FastMCP server — MCP + SPARQL surface
│   ├── main.py                 # fastmcp.FastMCP("Infobús MCP Server"), port 3278
│   ├── Dockerfile
│   └── pyproject.toml          # fastmcp>=3.1.1, python>=3.14
│
├── knowledge/                  # Apache Jena Fuseki — SPARQL / knowledge graph
│   ├── Dockerfile              # Jena Fuseki Main (SPARQL server, default port 3030)
│   ├── download.sh entrypoint.sh log4j2.properties
│   └── databases/              # TDB2 stores (bind-mounted for persistence)
│
├── database/                   # PostgreSQL + PostGIS
├── frontend/                   # (scaffold — README only so far)
├── scripts/                    # dev.sh, prod.sh
├── docs/                       # (scaffolding per recent commit fdfa618)
├── compose.dev.yml / compose.prod.yml
├── ARCHITECTURE.md             # AUTHORITATIVE mermaid diagram
├── AGENTS.md                   # Agent/dev guidance
└── README.md
```

**Recent evolution (git log):**
- `b34a290` — replaced `gtfs` git submodule with `gtfs-django` PyPI package (mirrors databus's move).
- `7ddd3a3` / `1c0c951` — renamed directory `core` → `backend`, renamed service `backend` → `orchestrator`.
- `fdfa618` — docs scaffolding.

---

## Compose Services (dev — authoritative, from compose.dev.yml)

| Service | Image / build | Role | Ports |
|---|---|---|---|
| `orchestrator` | `./backend` target `dev` | Django HTTP + admin + REST/GraphQL/WS/SSE | 8000 |
| `engine` | `./backend` target `engine` | Celery worker — info providers, GTFS polling, WebSocket consumers | — |
| `scheduler` | `./backend` target `scheduler` | Celery Beat | — |
| `broker` | `rabbitmq:4-management` | AMQP message broker | 5672, 15672, 15692 |
| `database` | `./database` | PostgreSQL + PostGIS | — |
| `memory` | `redis:7-alpine` | Cache, sessions, Channels layer | 6379 |
| `context` | `./context` | FastMCP server | 3278 |
| `knowledge` | `./knowledge` (Jena Fuseki 5.3.0, TDB2+update, `/ds`) | SPARQL | 3030 |
| `user-interface` | `./frontend` | Nuxt UI (`NUXT_PUBLIC_API_BASE=http://orchestrator:8000`) | 3000 |

**Backend Dockerfile targets** (`./backend/Dockerfile`): `dev`, `engine`, `scheduler` — i.e. there is a **single `engine` Celery worker** (no split into `realtime-engine`/`schedule-engine` like databus).

**Shared volumes**: `backend_venv` (uv venv shared across orchestrator/engine/scheduler), `lake_data` mounted at `/app/data` across the same three, plus per-service data volumes.

**Not in compose yet** (architecture doc ambition, not wired):
- `trips` (OpenTripPlanner) — ARCHITECTURE.md shows OTP for ETA/trip planning, but no service exists in compose.dev.yml.
- No `telemetry-broker` — infobus does not ingest MQTT; telemetry ingestion lives in `databus`.

**Inter-container hostnames** (use these, not `localhost`):
```
DB_HOST=database
REDIS_HOST=memory
# RabbitMQ host:     broker
# MCP host:          context
# SPARQL host:       knowledge
# Backend (from UI): orchestrator
```

Default network: `infobus_network`.

---

## Architecture (from ARCHITECTURE.md)

```
GTFS Schedule  ──HTTP polling──►  engine (Celery)  ──►  orchestrator (Django)
GTFS Realtime  ──HTTP polling──►       ▲                      │
                                       │                      ├── REST API   ◄── HTTP clients
                                       ▼                      ├── GraphQL    ◄── HTTP clients
                                 broker (RabbitMQ)             ├── WebSocket ◄── displays (kiosks)
                                       ▲                      ├── SSE        ◄── clients
                                       │                      └── ETA + Trip Planning (via OTP)
                                 scheduler (Celery Beat)
                                       │
                              memory (Redis) ⇄ state r/w
                              database (PostgreSQL)
                              lake (Parquet saves)

                              context (FastMCP) ──► knowledge (Jena Fuseki/SPARQL)
                              context queries orchestrator
                              MCP ──► context
                              SPARQL ──► knowledge
                              trips (OpenTripPlanner) ◄── orchestrator queries
```

See the "Compose Services" table above for the concrete list. `trips` (OTP) appears in ARCHITECTURE.md but is **not yet wired** in compose.

---

## Django Apps (backend/)

- **`infobus/`** — Django project (settings, ASGI, Celery, routing).
- **`website/`** — public pages, user management.
- **`alerts/`** — digital screen management (PostGIS `Point` locations), WebSocket consumers for real-time screen content, CAP alerts.
- **`engine/`** — information service providers (weather, social, GTFS fetch), WebSocket consumers.
- **`api/`** — DRF ViewSets for REST endpoints.
- **`gtfs_compat.py`** — compatibility shim around the `gtfs-django` PyPI package (post-submodule migration).

> GTFS models come from the **`gtfs-django` PyPI package** (same package databus uses). Historically this was a git submodule; replaced recently (`b34a290`).

---

## Key Celery Tasks (engine/)

- GTFS Realtime polling (consumes databus's feed).
- `get_weather()` — weather per screen location.
- `get_social_feed()` — curated transit social content.
- `get_cap_alerts()` — CAP (Common Alerting Protocol) emergency alerts.

Scheduled via Django admin (`/admin/django_celery_beat/`) — not hardcoded in settings.

---

## Data Flow

1. **Polling**: `engine` Celery tasks periodically pull GTFS Schedule + Realtime feeds (from `databus` and/or external transit agencies).
2. **Processing + classification**: Data validated and classified by screen relevance (which stops/routes each kiosk shows).
3. **Distribution**: Django Channels WebSockets push live updates to connected displays; REST/GraphQL serve structured data; SSE for streaming clients; MCP/SPARQL for contextual queries.
4. **Rendering**: Raspberry Pi kiosks in kiosk-mode render passenger information. Mobile/web apps consume the APIs.

---

## API Surfaces

| Endpoint | Purpose |
|---|---|
| `/api/` | DRF browsable root |
| `/api/gtfs/` | GTFS Schedule + Realtime data |
| `/api/alerts/` | Screen management + alerts |
| `/api/weather/` | Per-location weather |
| `/ws/alerts/` | Real-time screen updates |
| `/ws/status/` | Live transit streaming |
| MCP (context) | default port 3278 |
| SPARQL (knowledge) | Jena Fuseki (default 3030) |

---

## Dev Commands

```bash
# One-command bootstrap (init submodules if any remain, then build + run)
./scripts/dev.sh

# Logs
docker compose -f compose.dev.yml logs -f
docker compose -f compose.dev.yml logs -f orchestrator
docker compose -f compose.dev.yml logs -f engine

# Django management (via orchestrator + uv)
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py migrate
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py createsuperuser
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py shell
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py test

# Code quality (from ./backend)
cd backend
ruff check . && ruff format .

# Stop
docker compose -f compose.dev.yml down
```

Default admin (dev only): `admin` / `admin`.

---

## Service URLs (dev)

| Service | URL |
|---|---|
| Website | http://localhost:8000 |
| Django Admin | http://localhost:8000/admin |
| API | http://localhost:8000/api/ |
| Health (prod via nginx) | http://localhost/health/ |
| MCP (context) | http://localhost:3278 |
| SPARQL (knowledge) | http://localhost:3030 |

Production adds an Nginx reverse proxy (`compose.prod.yml`) with rate limiting, security headers, SSL-ready config.

---

## Environment

Hostnames between containers (never `localhost`):
```
DB_HOST=database
REDIS_HOST=memory         # (per ARCHITECTURE.md; verify against compose)
# RabbitMQ: broker
# MCP: context
# SPARQL: knowledge
# OTP: trips
```

Env files (layered):
- `.env` — base (committed, no secrets)
- `.env.dev` — dev overrides (committed)
- `.env.prod` — prod template (committed, no secrets)
- `.env.local` — local secrets (git-ignored)

macOS PostGIS:
```
GDAL_LIBRARY_PATH=...
GEOS_LIBRARY_PATH=...
```

Timezone: `America/Costa_Rica`. Python: **3.12+** (README); context service is **3.14+**. Package manager: **uv**.

---

## Relationship to `databus`

```
Vehicles ──MQTT──► databus ──GTFS-RT .pb feed──► infobus ──► displays / REST / GraphQL / WS / SSE / MCP
                      │                             │
                      └ authoritative truth         └ passenger-facing projection + enrichment
```

- `databus` owns the **data plane** (ingest telemetry, build GTFS-RT, persist traces).
- `infobus` owns the **experience plane** (display, API, enrichment with weather/social/CAP, knowledge graph, trip planning).
- Both share the Django/Celery/Redis/Postgres stack and the same `gtfs-django` PyPI package for GTFS models — but their mandates are different:
  - `databus` must **never** be coupled to passenger UX concerns.
  - `infobus` must **never** attempt to produce GTFS-RT — it consumes it.

Infobus-specific additions over databus:
- **`context`** (FastMCP) — MCP server for contextual queries.
- **`knowledge`** (Jena Fuseki) — SPARQL/RDF knowledge graph.
- **`trips`** (OTP) — trip planning + ETA.
- **WebSockets/SSE** via Django Channels (Daphne ASGI) — for live display updates.
- **Screen/kiosk management** — PostGIS-coordinated screen locations, Raspberry Pi kiosk deployment.

---

## Common Pitfalls

- **Don't produce GTFS-RT inside infobus.** Consume it from databus.
- **Screens have geographic coordinates** (PostGIS `Point`) — always query via spatial filters, not by string matching.
- **Celery Beat schedule** is in Django admin, not in settings.
- Use Docker service names between containers, never `localhost`.
- Dev default superuser is `admin/admin` — never use in prod.
- Run `git submodule update --init --recursive` after clone/pull *if* any submodules remain (recent migration to `gtfs-django` PyPI reduced submodule usage; verify `.gitmodules`).
- Toggling local editable `gtfs-django` (if supported here like in databus) may require removing the venv volume.
- WebSocket endpoints need Daphne/ASGI — don't fall back to WSGI `runserver` for features under `/ws/`.
- The `gtfs_compat.py` shim exists because of the submodule → PyPI migration; prefer it over direct `gtfs` imports where it's used.

---

## Authoritative References (in repo)

- `ARCHITECTURE.md` — the mermaid diagram is the source of truth for services + edges.
- `AGENTS.md` — dev commands + app structure.
- `README.md` — feature overview + quick start.

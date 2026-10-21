# Infobús

![Static Badge](https://img.shields.io/badge/backend-Django-white?logo=django)
![Static Badge](https://img.shields.io/badge/task_queue-Celery-white?logo=celery)
![Static Badge](https://img.shields.io/badge/package_manager-uv-white?logo=uv)
![Static Badge](https://img.shields.io/badge/frontend-Nuxt-white?logo=nuxt)
![Static Badge](https://img.shields.io/badge/database-PostgreSQL-white?logo=postgresql)
![Static Badge](https://img.shields.io/badge/memory-Redis-white?logo=redis)
![Static Badge](https://img.shields.io/badge/broker-RabbitMQ-white?logo=rabbitmq)
![Static Badge](https://img.shields.io/badge/mcp-FastMCP-white?logo=modelcontextprotocol)
![Static Badge](https://img.shields.io/badge/sparql-Fuseki-white?logo=apache)
![Static Badge](https://img.shields.io/badge/infrastructure-Docker-white?logo=docker)

A real-time public transportation information system. Infobús consumes GTFS Schedule and Realtime feeds published by Databús, tracks vehicle runs, and delivers live transit information through a read-only REST API and topic-based WebSocket updates — all orchestrated through Docker Compose. The Nuxt frontend, MCP server and knowledge graph are provisioned but still scaffolding.

<img width="250" alt="infobus" src="https://github.com/user-attachments/assets/09695506-2392-4b9c-a89e-8d42d649ed21" />

## Architecture

| Service            | Role                                        | Tech                   |
| ------------------ | ------------------------------------------- | ---------------------- |
| **orchestrator**   | REST API, admin, website, WebSockets        | Django / Daphne (ASGI) |
| **engine**         | Feed ingestion, run lifecycle, data purge   | Celery worker          |
| **scheduler**      | Triggers periodic tasks                     | Celery Beat            |
| **streams-consumer** | Turns Redis stream events into WebSocket snapshots | Django Channels |
| **user-interface** | Web frontend (template, mock data)          | Nuxt                   |
| **database**       | Durable persistence with geospatial support | PostgreSQL + PostGIS   |
| **memory**         | Celery broker, Channels layer, run state, event stream, cache | Redis |
| **broker**         | Provisioned, not used by Celery             | RabbitMQ               |
| **context**        | MCP tool server (stub)                      | FastMCP                |
| **knowledge**      | SPARQL / knowledge graph (empty)            | Apache Jena Fuseki     |
| **docs**           | Documentation site (production only)        | nginx                  |

See [ARCHITECTURE.md](ARCHITECTURE.md) for the service diagram.

### Django apps (backend/)

- **feed** — GTFS Schedule and Realtime models, feed publishers, schedule import, Parquet export
- **engine** — Celery tasks and information service models
- **runs** — Vehicle run model and lifecycle state machine
- **updates** — Redis-stream consumer, projections and the `ws/updates/` WebSocket
- **api** — Read-only DRF API with rate limiting and OpenAPI docs
- **website** — Template pages and user profile

GTFS base models come from the `gtfs-django` / `gtfs-io` packages, which the container entrypoint clones into `backend/` (they are not git submodules).

### Data flow

1. Celery Beat triggers the Realtime fetch every 30 s and the Schedule check hourly; feed URLs come from `FeedPublisher` records in the database
2. Fetched data is stored in PostgreSQL, run state is updated in Redis, and events are appended to the Redis stream `events`
3. `streams-consumer` builds topic projections and pushes them through Django Channels
4. WebSocket clients on `ws/updates/` subscribe to topics and receive live snapshots; the REST API serves schedule data

## Getting Started

### Prerequisites

- Docker Engine 24+ and Docker Compose v2
- Git

### Setup

```bash
git clone https://github.com/simovilab/infobus.git
cd infobus
cp .env.example .env   # edit with your values
./scripts/dev.sh
```

The startup script pulls images, builds containers, runs migrations, and waits for all services to become healthy. On first run this takes 1–2 minutes.

### Development URLs

| URL                         | Description                       |
| --------------------------- | --------------------------------- |
| http://localhost:8000       | Orchestrator / API                |
| http://localhost:8000/admin | Django admin (admin/admin)        |
| http://localhost:8000/api/  | REST API root                     |
| http://localhost:3000       | Nuxt frontend                     |
| http://localhost:15672      | RabbitMQ management (guest/guest) |
| http://localhost:3030       | Fuseki SPARQL endpoint            |
| http://localhost:3278       | MCP context server                |

### Common commands

```bash
# Logs
docker compose -f compose.dev.yml logs -f              # all services
docker compose -f compose.dev.yml logs -f orchestrator  # single service

# Django management
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py migrate
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py createsuperuser
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py shell

# Stop
docker compose -f compose.dev.yml down
```

### Code quality

```bash
# From backend/
ruff check .
ruff format .
pytest
```

## Production Deployment

Production runs on Docker Compose behind a [Traefik](https://traefik.io/) reverse proxy that handles TLS termination via Let's Encrypt. All traffic goes through port **443**. No services expose ports directly to the host.

### Quick start

```bash
cp .env.example .env   # add production domains and credentials (see below)
./scripts/prod.sh
```

### Required environment variables

```bash
# Domain routing (Traefik)
ORCHESTRATOR_DOMAIN=api.example.com
UI_DOMAIN=app.example.com
KNOWLEDGE_DOMAIN=knowledge.example.com
CONTEXT_DOMAIN=context.example.com
BROKER_DOMAIN=broker.example.com
DOCS_DOMAIN=docs.example.com
CERT_RESOLVER=letsencrypt

# Credentials
SECRET_KEY=<generate-a-strong-key>
DB_PASSWORD=<strong-password>
REDIS_PASSWORD=<strong-password>
RABBITMQ_USER=infobus
RABBITMQ_PASS=<strong-password>
```

### Production services

| Service        | Domain variable       | Description                |
| -------------- | --------------------- | -------------------------- |
| orchestrator   | `ORCHESTRATOR_DOMAIN` | Django API and admin       |
| user-interface | `UI_DOMAIN`           | Nuxt frontend              |
| knowledge      | `KNOWLEDGE_DOMAIN`    | Fuseki SPARQL endpoint     |
| context        | `CONTEXT_DOMAIN`      | MCP context server         |
| docs           | `DOCS_DOMAIN`         | Documentation site (nginx) |

Internal-only (not exposed): `database`, `memory`, `broker`, `engine`, `scheduler`, `streams-consumer`.

`BROKER_DOMAIN` is still checked by `scripts/prod.sh`, but the broker has no Traefik router in `compose.prod.yml`.

### Common operations

```bash
# Rebuild and restart after code changes
docker compose -f compose.prod.yml build orchestrator user-interface
docker compose -f compose.prod.yml up -d orchestrator user-interface

# Django management
docker compose -f compose.prod.yml exec orchestrator uv run python manage.py migrate
docker compose -f compose.prod.yml exec orchestrator uv run python manage.py createsuperuser

# Stop
docker compose -f compose.prod.yml down
```

## API

### REST endpoints

All endpoints are read-only and rate-limited (anonymous 60/min by default).

| Endpoint                                  | Description                                           |
| ----------------------------------------- | ----------------------------------------------------- |
| `/api/`                                   | API root (DRF browsable interface)                    |
| `/api/agencies/`, `stops/`, `routes/`, `trips/`, `stop-times/`, `shapes/`, `calendars/`, `calendar-dates/`, `fare-attributes/`, `fare-rules/`, `feed-info/` | GTFS Schedule resources |
| `/api/geo-stops/`, `/api/geo-shapes/`     | GeoJSON stops and shapes                              |
| `/api/feed-publishers/`, `/api/info-services/` | Feed publishers and information services         |
| `/api/next-trips/`, `next-stops/`, `route-stops/` | Derived schedule queries                      |
| `/api/docs/`                              | Redoc API documentation                               |

### WebSocket endpoint

| Endpoint      | Description                                                                 |
| ------------- | --------------------------------------------------------------------------- |
| `/ws/updates/` | Send `{"action": "subscribe", "topic": "..."}` to receive live topic snapshots |

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — Service mandates and design principles
- [docs/](docs/) — Full documentation site (run locally or deployed at `DOCS_DOMAIN`)

## Contributing

See the [guidelines](https://github.com/simovilab/.github/blob/main/CONTRIBUTING.md).

## Contact

- Email: simovi@ucr.ac.cr
- Website: [simovi.org](https://simovi.org)

## License

Apache 2.0

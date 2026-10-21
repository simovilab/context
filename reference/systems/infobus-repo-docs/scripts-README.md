# Infobús Scripts

Convenience scripts to start the Infobús stack in each environment. Both run from the repo root regardless of where they are invoked.

## Scripts

### `dev.sh` - Development Environment

Builds and starts `compose.dev.yml`:
- Source bind mounts for live code changes
- Django runserver (ASGI via daphne) with `DEBUG` enabled
- Pulls images that have no local build, creates the Fuseki directories (`knowledge/logs`, `knowledge/databases/DB2`)
- Waits for the orchestrator to respond, then prints service URLs

**Usage:**
```bash
./scripts/dev.sh
```

**Prerequisites:**
- Docker and `curl`
- `.env` (the script copies `.env.example` to `.env` and exits if it is missing)
- `.env.dev` (optional; a warning is printed if absent)

**Services started** (default host ports, overridable in `.env`):
- Orchestrator / API: http://localhost:8000 (`BACKEND_PORT`)
- Nuxt frontend: http://localhost:3000 (`USER_INTERFACE_PORT`)
- Redis: localhost:6379 (`MEMORY_PORT`)
- RabbitMQ: 5672, management 15672 (`BROKER_AMQP_PORT`, `BROKER_MANAGEMENT_PORT`)
- MCP context: http://localhost:3278 (`CONTEXT_PORT`)
- Fuseki: http://localhost:3030
- PostgreSQL is not published to the host.

### `prod.sh` - Production Environment

Starts `compose.prod.yml` behind an external Traefik proxy:
- Validates required variables: `ORCHESTRATOR_DOMAIN`, `UI_DOMAIN`, `KNOWLEDGE_DOMAIN`, `CONTEXT_DOMAIN`, `BROKER_DOMAIN`, `DOCS_DOMAIN`, `SECRET_KEY`, `DB_PASSWORD`, `REDIS_PASSWORD`, `RABBITMQ_PASS`
- Creates the external `traefik_proxy` Docker network if missing
- Validates the compose configuration, then builds and starts the services
- No host ports are published; Traefik routes each domain over TLS (port 443)

**Usage:**
```bash
./scripts/prod.sh
```

**Prerequisites:**
- Docker
- `.env` and `.env.prod` (the script exits if `.env.prod` is missing)
- A running Traefik container attached to `traefik_proxy`

## Common Commands

### Development
```bash
docker compose -f compose.dev.yml logs -f
docker compose -f compose.dev.yml down
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py shell
docker compose -f compose.dev.yml exec orchestrator uv run python manage.py migrate
```

### Production
```bash
docker compose -f compose.prod.yml logs -f
docker compose -f compose.prod.yml down
docker compose -f compose.prod.yml exec orchestrator uv run python manage.py shell
```

## File Structure

```
scripts/
├── README.md          # This documentation
├── dev.sh             # Development startup script
└── prod.sh            # Production startup script
```

## Environment Files

- `.env` - Base configuration (not in git; start from `.env.example`)
- `.env.dev` - Development overrides (tracked)
- `.env.prod` - Production overrides (tracked)

`.env` is read first, then the environment overlay.

## Troubleshooting

1. **Permission denied**: Run `chmod +x scripts/*.sh`
2. **Missing `.env`**: The scripts copy `.env.example` and exit; edit it and re-run
3. **Port conflicts**: Change the `*_PORT` variables in `.env` or stop the conflicting process
4. **Orchestrator slow on first start**: First run applies migrations and installs dependencies; wait 1-2 minutes and check `docker compose -f compose.dev.yml logs -f orchestrator`

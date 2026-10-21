> Refreshed against databus `main` (2026-10-20). Corrects the original, which called `dev.sh` equivalent to `up --build` and implied all scripts need only `redis-py`.

# scripts/

- **dev.sh** (bash, needs docker): checks docker, `pull --ignore-buildable`, `up --build -d --remove-orphans`, waits for service health, prints per-service health, a volume check, URLs and hints. Not just `up --build`.
- **prod.sh** (bash, needs docker): creates the external `traefik_proxy` network if missing, validates the compose config, pulls and builds, starts `database`, `state`, `message-broker` first and waits for health, then `up -d` and checks the orchestrator.
- **inspect_redis.py** (needs `redis-py`): read-only inspection of vehicles, runs, positions and data age. Run `python scripts/inspect_redis.py` (against a host-reachable Redis) or via `docker compose exec`. The plain `redis-cli keys '*'` example is a different tool.
- **cleanup_redis.py** (needs `redis-py`): removes stale vehicle data from Redis by age threshold (`--dry-run` supported).
- **backend/scripts/cleanup_runs.py**: run cleanup; lists the decommissioned `vehicle:<id>:progression` key.

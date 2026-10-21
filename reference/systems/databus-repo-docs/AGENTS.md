> Refreshed against databus `main` @ `1be2da1` (2026-10-20). Replaces the stale repo AGENTS.md, which described separate `publisher/`/`scheduler/` projects, a submodule workflow, a `django_celery_beat`-driven schedule and an edge `progression` key.

# AGENTS.md

## Project overview

Databús produces GTFS Schedule and GTFS-RT feeds. Everything is a Django app in `backend/` (`api`, `runs`, `realtime_engine`, `schedule_engine`, `feed`, `operations`, `website`, `messages`); runtime "services" are Celery workers started from the same project. **Stack:** Python ≥3.14, Django 6.0.4, Celery ≥5.6, Channels/Daphne, PostgreSQL/PostGIS, Redis, RabbitMQ, NanoMQ, uv.

## Commands

```bash
./scripts/dev.sh                                   # whole dev stack
docker compose -f compose.dev.yml logs -f <service>
make lint        # cd backend && uv run ruff check .
make typecheck   # mypy in orchestrator container
make test        # pytest in orchestrator container (gtfs-eta ignored)
```

Run Python tooling inside containers; the shared `backend_venv` volume is populated at runtime by `uv sync --frozen` (not at image build).

## Invariants

- Redis is the real-time truth. Telemetry keys (`vehicle:<id>:position|occupancy`, `runs:last_seen:<id>`, `run:<id>:vehicle_stop_status`, `run:<id>:stop_time_updates`) are written by `realtime-engine`. Lifecycle actions (`runs/domain/lifecycle/actions.py`) also write `run:*`, `*:current_run` and `runs:tracking`/`runs:in_progress` in whichever process handles the transition, including `orchestrator`. `schedule-engine` only reads.
- Canonical key helpers: `backend/runs/domain/telemetry/keys.py` (some keys are hardcoded in `actions.py`/`dispatch.py`). No `vehicle:<id>:progression`; progression is computed server-side (`runs/domain/progression/compute.py`).
- MQTT consumer = Celery bootstep in `realtime-engine`, gated by `MQTT_CONSUMER_ENABLED` (default false; set inline in dev compose only). Topics: `transit/vehicle/+/position`, `+/occupancy`.
- HTTP telemetry (`fetch_positions`, every 10 s) republishes onto MQTT; it never writes Redis.
- Feeds are built by `schedule_engine` tasks. `build_alerts` is a stub and unscheduled.
- Beat schedule is in `backend/databus/celery.py`. Queues are set by `@shared_task(queue=…)` and worker `-Q`.
- Run lifecycle states: Requested, Validated, Initialized, Confirmed, Tracking, In Progress, No Signal, Completed, Interrupted, Short Turned, `Cancelled`. Commands vs detected facts: see `reference/systems/databus.md` §5.
- AMQP: `messages.publisher.publish_event` publishes `runs.lifecycle.<event>` on `databus.events` after each transition; no consumer exists.
- Dependencies `gtfs-django`/`gtfs-io` are untracked gitignored clones (uv workspace); `gtfs-eta` is a uv path source and an orphan gitlink. Do not look for `.gitmodules`.
- Docker service names, never `localhost`, between containers.

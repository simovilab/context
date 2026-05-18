---
name: databus
description: Skill for working inside the databus monorepo — SIMOVI's core GTFS Schedule + Realtime backend. Load when working on any databus service or submodule. Sourced from ARCHITECTURE.md, AGENTS.md, MODEL.md, compose.dev.yml, backend/Dockerfile (as of 2026-04-22).
---

# Skill: databus

Load this skill when working inside the `databus` monorepo or on any service that produces GTFS Schedule or Realtime feeds. Also load when debugging the realtime pipeline (telemetry → Redis state → protobuf feed).

## What this skill contains

This skill defers to the canonical reference at `reference/systems/databus.md` in the same repo. Read that file when this skill loads — it contains the full monorepo structure, compose services table, key models, and data flow.

## Key invariants

- **databus is the GTFS-RT producer.** `infobus` consumes it — never the reverse.
- **`realtime-engine` does NOT build protobuf feeds** — that is `schedule-engine`'s sole responsibility.
- **`realtime-engine` does NOT use Redis as a message bus** — Redis is state only; RabbitMQ is the bus.
- Both Redis AND RabbitMQ are in use: Redis = authoritative real-time state, RabbitMQ = command/observation/assertion messages.
- The old `tasks`/`publisher` service names = today's `schedule-engine`. Top-level `publisher/`, `realtime-engine/`, `scheduler/`, `processing/` dirs are legacy — live code is in `./backend/`.
- Celery Beat schedule lives in Django admin (`/admin/django_celery_beat/`), not hardcoded in settings.
- Never use PostgreSQL for real-time decisions — always read Redis.
- Use Docker service names (`database`, `state`, `message-broker`, `telemetry-broker`), never `localhost` between containers.
- GTFS-RT `timestamp` is Unix epoch **seconds**, not milliseconds.
- `stop_sequence` may not be contiguous — always use the exact value from `stop_times.txt`.
- Toggling `GTFS_DJANGO_DEV=True` requires removing the `backend_venv` Docker volume.

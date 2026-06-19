---
name: databus
description: Skill for working inside the databus monorepo — SIMOVI's core GTFS Schedule + Realtime backend. Load when working on any databus service or app. Sourced from the as-built backend (backend/runs/domain/, realtime_engine/, schedule_engine/, databus/celery.py, compose.dev.yml) as of 2026-06-19. Where ARCHITECTURE.md/AGENTS.md/MODEL.md disagree with source, source wins.
---

# Skill: databus

Load this skill when working inside the `databus` monorepo or on any service that produces GTFS Schedule or Realtime feeds. Also load when debugging the realtime pipeline (telemetry → Redis state → server-side map-matching → protobuf feed).

## What this skill contains

This skill defers to the canonical reference at `reference/systems/databus.md` in the same repo. Read that file when this skill loads — it contains the as-built monorepo structure, compose services table, canonical Redis keys, run lifecycle, and data flow.

## Key invariants

- **databus is the GTFS-RT producer.** `infobus` consumes it — never the reverse.
- **Everything is a Django app inside `backend/`** plus Celery workers — there are no separate `realtime-engine/`, `publisher/`, `scheduler/`, `processing/` Python projects. Those top-level dirs in `AGENTS.md`/`MODEL.md` are legacy intent.
- **`realtime-engine` does NOT build protobuf feeds** — that is `schedule-engine`'s sole responsibility. The old `tasks`/`publisher` service names = today's `schedule-engine`.
- **`realtime-engine` is the only writer of Redis state.** Redis = authoritative real-time state, read by `schedule-engine`. Never use PostgreSQL for real-time decisions — read Redis.
- **The MQTT consumer is a Celery bootstep inside `realtime-engine`**, gated by `MQTT_CONSUMER_ENABLED` so exactly one worker subscribes. It uses a per-process client id `databus-mqtt-consumer-<host>-<pid>`; a fixed id caused duplicate-consumer reconnect wars. It is NOT a standalone process.
- **It subscribes only to `position` and `occupancy`** (`transit/vehicle/<id>/<leaf>`). `progression` is decommissioned at the edge and ignored if sent.
- **Progression is computed server-side.** Real GPS→polyline map-matching in `runs/domain/progression/compute.py` produces `run:<id>:vehicle_stop_status` (`STOPPED_AT`/`INCOMING_AT`/`IN_TRANSIT_TO`). There is **no** `vehicle:<id>:progression` Redis key.
- **Canonical Redis keys live in `backend/runs/domain/telemetry/keys.py`** — not the lists in `AGENTS.md`. Note `run:<id>:stop_time_updates` is a JSON **string** with a staleness TTL, not a hash. Edge `occupancy_status` is recomputed via `classify_status` and the edge value discarded.
- **Heavy work runs off the MQTT thread** in the `process_position_update` Celery task (re-reads Redis last-write-wins, runs map-matching + detection), not on the paho network callback.
- **`run_completed` is a detected fact, not a command** — `RunCompletedDetector` fires when `vehicle_stop_status` is `STOPPED_AT` the final stop. Lifecycle states use `Cancelled`, not `CANCELED`.
- **Celery Beat schedule lives in code** (`backend/databus/celery.py`), NOT in `django_celery_beat` admin. Two queues: `realtime_engine` and `schedule_engine`. Cadence: VehiclePositions 15 s, TripUpdates 15 s, alerts 10 s (stub), `scan_stale_runs` 30 s.
- **AMQP (RabbitMQ / `message-broker`) is largely designed, not wired.** `backend/messages/publisher.py` `publish_event` is a stub that only `print()`s. Treat the `databus.events` exchange and `runs.*` command/observation/assertion messages as intended design, not current behavior.
- **GTFS Schedule models come from `gtfs-django`**, a `uv` workspace package (editable, with `gtfs-io`) providing the `gtfs` app — first in `INSTALLED_APPS`. It is **not** a git submodule (no `.gitmodules`).
- Use Docker service names (`orchestrator`, `realtime-engine`, `schedule-engine`, `scheduler`, `database`, `state`, `message-broker`, `telemetry-broker`), never `localhost` between containers.
- `telemetry-broker` is **NanoMQ** (not HiveMQ/EMQX).
- GTFS-RT `timestamp` is Unix epoch **seconds**, not milliseconds.
- `stop_sequence` may not be contiguous — always use the exact value from `stop_times.txt`.
- Toggling the editable `gtfs-django` workspace package may require removing the `backend_venv` Docker volume.

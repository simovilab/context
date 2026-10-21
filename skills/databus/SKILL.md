---
name: databus
description: Skill for working inside the databus monorepo — SIMOVI's core GTFS Schedule + Realtime backend. Load when working on any databus service or app. Verified against databus `main` @ 1be2da1 on 2026-10-20. Where ARCHITECTURE.md/AGENTS.md/MODEL.md/README.md disagree with source, source wins.
---

# Skill: databus

Load this skill when working inside the `databus` monorepo or on any service that produces GTFS Schedule or Realtime feeds. Also load when debugging the realtime pipeline (telemetry → Redis state → server-side map-matching → protobuf feed).

## What this skill contains

This skill defers to the canonical reference at `reference/systems/databus.md` in the same repo. Read that file when this skill loads — it contains the as-built monorepo structure, compose services table, canonical Redis keys, run lifecycle, data flow and toolchain. Refreshed copies of the repo's own top-level docs are in `reference/systems/databus-repo-docs/`.

**As of:** 2026-10-20, databus `main` @ `1be2da1`.

## Key invariants

- **databus is the GTFS-RT producer.** `infobus` consumes it — never the reverse.
- **Everything is a Django app inside `backend/`** plus Celery workers — there are no separate `realtime-engine/`, `publisher/`, `scheduler/`, `processing/` Python projects. Those top-level dirs in `AGENTS.md`/`MODEL.md` are legacy intent. Apps: `api`, `runs`, `realtime_engine`, `schedule_engine`, `feed`, `operations`, `website`, `messages`. Toolchain: Python ≥3.14, Django 6.0.4.
- **`realtime-engine` does NOT build protobuf feeds** — that is `schedule-engine`'s sole responsibility (`build_vehicle_positions`, `build_trip_updates`). The old `tasks`/`publisher` service names = today's `schedule-engine`.
- **Telemetry state in Redis is written only by `realtime-engine`** (position, occupancy, `runs:last_seen`, `vehicle_stop_status`, `stop_time_updates`). But it is **not the only Redis writer**: run lifecycle actions (`runs/domain/lifecycle/actions.py`) write `run:*`, `*:current_run` and the `runs:tracking`/`runs:in_progress` sets in whichever process handles the transition — including the `orchestrator` (API commands call `RunLifecycleService.process_event`). `schedule-engine` only reads run/telemetry state. Never use PostgreSQL for real-time decisions — read Redis.
- **The MQTT consumer is a Celery bootstep inside `realtime-engine`**, gated by `MQTT_CONSUMER_ENABLED` (default **false**; `compose.dev.yml` sets it inline, `compose.prod.yml` does NOT — set it explicitly in prod). Per-process client id `databus-mqtt-consumer-<host>-<pid>`; a fixed id caused reconnect wars. It is NOT a standalone process.
- **It subscribes only to `transit/vehicle/+/position` and `+/occupancy`** (QoS 0). A `progression` leaf is dropped (`dropped_unknown_leaf`).
- **HTTP telemetry is a second source, same sink.** `fetch_positions` (beat, 10 s, `expires=10`) polls ACTIVE `Sensor`s (`source_type` http/both) via `realtime_engine/sources/` and **publishes to the same MQTT topic** — it never writes Redis directly. It is gated on `vehicle:<id>:current_run`, not `runs:in_progress`.
- **Progression is computed server-side.** GPS→polyline map-matching in `runs/domain/progression/compute.py` produces `run:<id>:vehicle_stop_status` (`STOPPED_AT` ≤20 m / `INCOMING_AT` ≤50 m / `IN_TRANSIT_TO`). There is **no** `vehicle:<id>:progression` Redis key.
- **Canonical Redis keys live in `backend/runs/domain/telemetry/keys.py`**, but several are hardcoded elsewhere (`trip:<id>:current_run`, `operator:<id>:current_run`, `runs:tracking`, `runs:in_progress`). `run:<id>:stop_time_updates` is a JSON **string** with a 60 s TTL, not a hash. Edge `occupancy_status` is recomputed via `classify_status` and discarded.
- **Heavy work runs off the MQTT thread** in the `process_position_update` Celery task (stop status → `RUN_COMPLETED` check → stop-time updates → run-start check), not on the paho callback.
- **`run_completed` is a detected fact, not a command.** `RunCompletedDetector` fires on any `STOPPED_AT` with a `stop_id` for an In Progress run; the FSM guard `is_at_terminal_stop` then enforces that it is the final stop (a non-terminal stop makes the guard raise and the event is logged, not applied). Lifecycle states use `Cancelled`, not `CANCELED`. Interrupt and short-turn are commands only (detectors are unregistered placeholders).
- **Staleness:** In Progress → No Signal when 60 s < staleness ≤ 600 s; No Signal → Cancelled when > 600 s (`runs/domain/detection/thresholds.py`).
- **Celery Beat schedule lives in code** (`backend/databus/celery.py`), NOT in `django_celery_beat` admin (installed, but no `DatabaseScheduler`). Queues `realtime_engine` and `schedule_engine` come from `@shared_task(queue=…)` and the worker `-Q` flags — there is no `CELERY_TASK_ROUTES`. Beat entries: VehiclePositions 15 s, TripUpdates 15 s, `scan_stale_runs` 30 s, `fetch_positions` 10 s, `build_schedule` daily, `fetch_schedule` hourly at :30. `build_alerts` is a stub and deliberately **not** scheduled.
- **AMQP is partly wired.** `backend/messages/publisher.py` `publish_event` is a real kombu publisher (topic exchange `databus.events`, routing key `runs.lifecycle.<event>`), called on every lifecycle transition from `runs/services/lifecycle.py`; broker errors are logged and swallowed. **Nothing consumes the events yet**, and the wider command/observation/assertion `runs.*` design is still design only.
- **GTFS Schedule zip** is a real feed: `feed/schedule/exporter.py` → `feed/files/gtfs.zip`, served at `/feed/schedule/feed.zip` (404 until generated). `docker-entrypoint.sh` always runs `load_publishers` and `bootstrap_schedule`; it exports the zip only if absent. Only `createsuperuser` and the demo-fleet load are gated on `DEBUG`.
- **GTFS Schedule models come from `gtfs-django`**, a `uv` workspace package (with `gtfs-io`) providing the `gtfs` app — first in `INSTALLED_APPS`. These are untracked, gitignored nested clones that the entrypoint clones if missing. `backend/gtfs-eta` (ETA inference lib, `uv` path source) is a real directory but is an **orphan gitlink** in git (no `.gitmodules`; `git submodule status` errors). There is no `.gitmodules`.
- Use Docker service names (`orchestrator`, `realtime-engine`, `schedule-engine`, `scheduler`, `database`, `state`, `message-broker`, `telemetry-broker`, `user-interface`), never `localhost` between containers.
- `telemetry-broker` is **NanoMQ** (anonymous, TCP 1883 only). Prod publishes no host ports; external Traefik routes everything.
- GTFS-RT `timestamp` is Unix epoch **seconds**, not milliseconds.
- `stop_sequence` may not be contiguous — always use the exact value from `stop_times.txt`.
- Toggling the editable `gtfs-django` workspace package may require removing the `backend_venv` Docker volume.
- Only CI workflow is docs deployment; there is no lint/test CI (`make lint|typecheck|test`).

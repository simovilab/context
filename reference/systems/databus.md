**Last verified:** 2026-05-17

# Databús

## 1. Role in SIMOVI

Databús is the GTFS Schedule and Realtime producer at the core of the SIMOVI transit data stack. It is responsible for ingesting raw vehicle telemetry from on-board equipment (OBE) via MQTT, managing the full lifecycle of transit runs (registration through completion), maintaining operational state in Redis, and publishing GTFS-RT VehiclePositions and TripUpdates feeds every 15 seconds. Downstream consumers — primarily Infobús — read these feeds to power passenger-facing displays and information services. Databús is the single authoritative source for real-time transit state in SIMOVI.

## 2. Monorepo Structure

```
backend/
  runs/           # Run domain: models, views, services, FSM engine, domain logic
  realtime/       # Realtime engine: telemetry consumer, Redis state management
  feed/           # GTFS-RT feed builder and publisher (Celery tasks)
    files/        # Published .pb and .json feed files
  gtfs/           # GTFS Schedule models and feed ingestion (gtfs-django)
  api/            # REST API (Django REST Framework)
compose.dev.yml   # Docker Compose for local development
```

## 3. Compose Services

| Service | Image / Build | Purpose |
|---|---|---|
| `api` | `./backend` (Django) | Django REST API — run registration, operator confirmation, state queries |
| `realtime_engine` | `./backend` (Celery worker) | Telemetry consumer and run lifecycle state writer; sole service authorized to write to Redis |
| `scheduler` | `./backend` (Celery Beat) | Periodic trigger for `build-gtfs-realtime` (every 15 s) and other scheduled tasks |
| `broker` | `rabbitmq` | RabbitMQ — AMQP message bus connecting `backend`, `realtime_engine`, and `tasks` |
| `telemetry_broker` | `nanomq` | NanoMQ MQTT broker — accepts high-frequency telemetry from OBE devices |
| `db` | `postgres` (PostGIS) | PostgreSQL + PostGIS — GTFS Schedule data, run records, event history |
| `state` | `redis` | Redis — in-memory operational state (active runs, vehicle positions, tracking sets) |

## 4. Key Models

**Run** (`runs.Run`): The central domain entity. Represents a single operational assignment of a vehicle to a trip on a given day. Holds `vehicle_id`, `trip_id`, `route_id`, `start_time`, `run_lifecycle_state` (PostgreSQL-persisted FSM state), `operator_id`, and timestamps. Each Run instance drives its own `run-lifecycle` state machine.

**Route / Trip / Stop / StopTime** (GTFS Schedule models via `gtfs-django`): Standard GTFS entities loaded from provider feeds. `Trip` links to `Route` and carries direction, shape, and calendar information. `StopTime` encodes the ordered stop sequence for each trip including `arrival_time`, `departure_time`, and `stop_sequence`.

**VehiclePosition / TripUpdate**: Ephemeral GTFS-RT entity representations built from Redis snapshots during each `build-gtfs-realtime` cycle. Not persisted to PostgreSQL directly; Parquet snapshots are saved via `save-gtfs-feed-messages`.

**Redis keys (state layer)**:
- `runs:in_progress` (Set) — all currently active run IDs
- `runs:tracking` (Set) — runs currently emitting telemetry
- `run:{id}` (Hash) — per-run metadata: `vehicle_id`, `trip_id`, `route_id`, `status`, etc.
- `vehicle:{id}:position`, `vehicle:{id}:progression`, `vehicle:{id}:occupancy` — latest telemetry per vehicle
- `runs:last_seen:{run_id}` — timestamp of last telemetry ping (used by `scan_stale_runs`)

## 5. Key Flows

### Telemetry → GTFS-RT

```
OBE device
  → MQTT (NanoMQ/telemetry_broker)
  → ingest-telemetry  [validate, normalize, associate run context]
  → update-system-state  [write vehicle position/progression/occupancy to Redis]
  → build-gtfs-realtime (every 15 s)  [snapshot Redis, build VP + TU protobufs, publish feed files]
  → save-gtfs-feed-messages  [serialize to Parquet, persist to store]
```

### Run Registration

```
Dispatcher/API call (POST /runs)
  → register-run [validate payload, check vehicle/trip/operator availability]
  → realtime_engine validates against GTFS schedule and Redis state
  → run metadata written to Redis (runs:in_progress, run:{id})
  → operator confirmation via API (PUT /runs/{id})
  → run activated (status: active) → telemetry tracking begins
```

### Run Termination

```
end-run (external: dispatcher API, or internal: realtime_engine detection)
  → validate run is active in Redis
  → finalizing: remove from runs:in_progress, delete run hash, release vehicle keys
  → run-lifecycle transitions to completed / cancelled / interrupted / short_turned
```

## 6. Links to FSMs

All process state machines are defined in `behavior/databus/system/`. Full process documentation (states, events, actions, guards) lives in `docs/`; XState-compatible JSON in `json/`.

| Process | JSON | Doc |
|---|---|---|
| `register-run` | [`behavior/databus/system/json/register-run.json`](../../behavior/databus/system/json/register-run.json) | [`docs/register-run.md`](../../behavior/databus/system/docs/register-run.md) |
| `ingest-telemetry` | [`behavior/databus/system/json/ingest-telemetry.json`](../../behavior/databus/system/json/ingest-telemetry.json) | [`docs/ingest-telemetry.md`](../../behavior/databus/system/docs/ingest-telemetry.md) |
| `update-system-state` | [`behavior/databus/system/json/update-system-state.json`](../../behavior/databus/system/json/update-system-state.json) | [`docs/update-system-state.md`](../../behavior/databus/system/docs/update-system-state.md) |
| `build-gtfs-realtime` | [`behavior/databus/system/json/build-gtfs-realtime.json`](../../behavior/databus/system/json/build-gtfs-realtime.json) | [`docs/build-gtfs-realtime.md`](../../behavior/databus/system/docs/build-gtfs-realtime.md) |
| `save-gtfs-feed-messages` | [`behavior/databus/system/json/save-gtfs-feed-messages.json`](../../behavior/databus/system/json/save-gtfs-feed-messages.json) | [`docs/save-gtfs-feed-messages.md`](../../behavior/databus/system/docs/save-gtfs-feed-messages.md) |
| `end-run` | [`behavior/databus/system/json/end-run.json`](../../behavior/databus/system/json/end-run.json) | [`docs/end-run.md`](../../behavior/databus/system/docs/end-run.md) |
| `run-lifecycle` | [`behavior/databus/system/json/run-lifecycle.json`](../../behavior/databus/system/json/run-lifecycle.json) | [`docs/run-lifecycle.md`](../../behavior/databus/system/docs/run-lifecycle.md) |

See [`behavior/databus/system/README.md`](../../behavior/databus/system/README.md) for the process flow chart and naming conventions.

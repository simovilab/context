**Last verified:** 2026-06-19

# Databús

## 1. Role in SIMOVI

Databús is the GTFS Schedule and Realtime producer at the core of the SIMOVI transit data stack. It ingests raw vehicle telemetry from on-board equipment (OBE) via MQTT, manages the full lifecycle of transit runs (registration through completion), maintains authoritative operational state in Redis, and publishes GTFS-RT VehiclePositions and TripUpdates feeds every 15 seconds. Downstream consumers — primarily Infobús — read these feeds to power passenger-facing displays. Databús is the single authoritative source for real-time transit state in SIMOVI.

> **databus is the GTFS-RT producer.** Infobús consumes the feeds — never the reverse.

## 2. Monorepo Structure

Databús is **not** a set of separate Python projects. Everything is a Django app inside `backend/`, and the runtime "services" are Celery workers launched from that same Django project. Top-level `realtime-engine/`, `publisher/`, `scheduler/`, `processing/` directories do **not** exist — that layout is legacy intent in `AGENTS.md`/`MODEL.md`.

```
backend/
  databus/          # Django project: settings.py, celery.py (beat schedule), asgi.py
  api/              # DRF REST API — run commands + telemetry reads
  runs/             # Run domain: models, views, and domain/ (lifecycle FSM, detection,
                    #   progression/map-matching, telemetry contracts) — the core
  realtime_engine/  # MQTT consumer (Celery bootstep) + Celery tasks (process_position_update,
                    #   run_lifecycle_event, scan_stale_runs)
  schedule_engine/  # GTFS Schedule query layer + GTFS-RT builders/tasks (the feed producer)
  feed/             # GTFS data models (Agency, Route, Trip, Stop, StopTime, Shape, Calendar)
    files/          # Published GTFS-RT output: vehicle_positions.{json,pb}, trip_updates.{json,pb}
  operations/       # Vehicle / operator / equipment models
  website/          # UI-facing views
  messages/         # AMQP event publisher (CURRENTLY A STUB — see §6)
  databus/celery.py # Celery app + beat schedule (in code, not django_celery_beat admin)
compose.dev.yml     # Docker Compose for local development
compose.prod.yml    # Production compose (Traefik, docs, static_files)
```

GTFS Schedule models come from **`gtfs-django`**, a `uv` workspace package (editable, alongside `gtfs-io`) that provides the `gtfs` Django app. It is listed first in `INSTALLED_APPS`. This was formerly a git submodule; there is no `.gitmodules` today.

## 3. Compose Services

Real service names from `compose.dev.yml` / `compose.prod.yml`. Use these Docker service names for inter-container networking — never `localhost`.

| Service | Build / Image | Process | Purpose |
|---|---|---|---|
| `orchestrator` | `./backend` (Django + Daphne ASGI) | HTTP/WebSocket | Control plane: DRF API, admin, run commands, Channels status push |
| `realtime-engine` | `./backend` (Celery worker, queue `realtime_engine`) | worker + MQTT bootstep | Telemetry consumer; **sole writer of Redis state**; runs `process_position_update`, `run_lifecycle_event`, `scan_stale_runs` |
| `schedule-engine` | `./backend` (Celery worker, queue `schedule_engine`) | worker | Builds GTFS-RT feeds from Redis snapshots; GTFS Schedule queries |
| `scheduler` | `./backend` (Celery Beat) | beat | Fires periodic tasks (feed builds, stale-run scan) per the in-code schedule |
| `database` | `postgres` (PostGIS) | — | GTFS Schedule data, run records, durable traces |
| `state` | `redis` | — | Authoritative in-memory real-time state |
| `telemetry-broker` | `nanomq` | — | **NanoMQ** MQTT broker — high-frequency OBE telemetry |
| `message-broker` | `rabbitmq` | — | AMQP bus for commands/observations/assertions (largely designed, not wired — see §6) |
| `analytics-engine` | `prefect` | — | Data workflows / analytics |
| `task-monitoring` | `flower` | — | Celery task monitoring (Flower) |
| `user-interface` | `nuxt` | — | Passenger/operator frontend |
| `docs` | `nginx` (prod only) | — | Built documentation site |

The MQTT consumer is **not** its own service — it is a Celery bootstep inside `realtime-engine`, gated by `MQTT_CONSUMER_ENABLED` so exactly one worker subscribes (see §5).

## 4. Key Models & State

**Run** (`runs.Run`): the central domain entity — one vehicle on one trip on one calendar day, with an operator. Holds `vehicle_id`, `trip_id`, `route_id`, `start_time`, `operator_id`, and a PostgreSQL-persisted lifecycle state. Each Run drives its own lifecycle FSM (see §5).

**GTFS Schedule models** (`gtfs` app via `gtfs-django`; `feed` app for related data): `Agency`, `Route`, `Trip`, `Stop`, `StopTime`, `Calendar`, `CalendarDate`, `Shape`. `StopTime` carries the ordered `stop_sequence` (may be non-contiguous — use the exact value from `stop_times.txt`).

**VehiclePosition / TripUpdate**: ephemeral GTFS-RT entities built from Redis snapshots during each feed-build cycle and written to `backend/feed/files/`. Not persisted as protobuf in PostgreSQL.

### Redis keys (canonical — from `backend/runs/domain/telemetry/keys.py`)

Two namespaces: `vehicle:<id>:*` is **edge-sensed**, `run:<id>:*` / `runs:*` is **server-computed**.

| Key | Type | Writer | Notes |
|---|---|---|---|
| `vehicle:<id>:position` | Hash | realtime-engine | Latest GPS (lat, lon, bearing, speed, timestamp) |
| `vehicle:<id>:occupancy` | Hash | realtime-engine | Latest occupancy (status recomputed server-side, see §6) |
| `vehicle:<id>:metadata` | Hash | realtime-engine | Vehicle metadata |
| `vehicle:<id>:current_run` | String | realtime-engine | Active run binding for the vehicle |
| `run:<id>` | Hash | realtime-engine | Per-run metadata |
| `run:<id>:trip` | Hash | realtime-engine | Trip context for the run |
| `run:<id>:vehicle_stop_status` | Hash | realtime-engine | **Server-computed** stop status (map-matching output) — replaces the old edge `progression` |
| `run:<id>:congestion_level` | Hash | realtime-engine | Congestion (deferred/partial) |
| `run:<id>:stop_time_updates` | **String (JSON)** | realtime-engine | TripUpdate projection — a JSON string with a staleness TTL, **not** a hash |
| `runs:last_seen:<id>` | String | realtime-engine | Last telemetry timestamp (drives `scan_stale_runs`) |
| `runs:tracking` | Set | realtime-engine | Runs currently emitting telemetry |
| `runs:in_progress` | Set | realtime-engine | Currently active run IDs |

> There is **no** `vehicle:<id>:progression` key. Progression is decommissioned at the edge; the server computes `run:<id>:vehicle_stop_status` via GPS→polyline map-matching.

## 5. Key Flows

### Telemetry → GTFS-RT

```
OBE device
  → MQTT  transit/vehicle/<id>/{position,occupancy}   (NanoMQ / telemetry-broker, QoS 0)
  → MQTT consumer (Celery bootstep in realtime-engine, gated by MQTT_CONSUMER_ENABLED)
       [parse → look up vehicle:<id>:current_run → validate via telemetry contract → HSET]
       [synchronous runs:last_seen write, then process_position_update.delay()]
  → process_position_update  (Celery task, off the paho network thread)
       [re-read Redis (last-write-wins) → map-matching → write vehicle_stop_status
        → completion detection → stop_time_updates projection → position-leaf detection]
  → build_vehicle_positions / build_trip_updates  (schedule-engine, every 15 s)
       [snapshot Redis → JSON → protobuf via json_format.ParseDict → feed/files/*.{json,pb}]
```

- The MQTT consumer subscribes **only** to `position` and `occupancy`. A `progression` leaf, if sent, is ignored.
- `MQTT_CONSUMER_ENABLED` ensures a single subscribing worker; the consumer uses a per-process client id `databus-mqtt-consumer-<host>-<pid>` to avoid reconnect wars between duplicate consumers.
- Heavy work runs in `process_position_update`, not on the MQTT callback thread.

### Map-matching (server-side progression)

`backend/runs/domain/progression/compute.py` (pure) loads cached shape geometry, projects GPS onto the polyline (`point_progress_m`), picks the upcoming stop, and applies three-state radius rules → `STOPPED_AT` / `INCOMING_AT` / `IN_TRANSIT_TO`, with a monotonic stop-sequence floor and an `IN_TRANSIT_TO` carry-forward fallback. The impure `producer.py` does the Redis I/O.

### Run lifecycle & commands vs. detected facts

The lifecycle FSM (`backend/runs/domain/lifecycle/`) has states: **Requested, Validated, Initialized, Confirmed, Tracking, In Progress, No Signal, Completed, Interrupted, Short Turned, Cancelled** (note: `Cancelled`, not `CANCELED`).

- **Commands** (synchronous, operator/API-driven): create run, confirm, complete, interrupt, short-turn, cancel — via REST.
- **Detected facts** (async, telemetry-driven): `run_tracking_started`, `run_started`, `run_completed`, `run_tracking_lost`, `run_tracking_restored`, `run_tracking_expired`. `run_completed` is a **detected fact** (the `complete_run`→`run_completed` rename marks this) — `RunCompletedDetector` fires when the server-computed `vehicle_stop_status` is `STOPPED_AT` the final stop.

REST run-command endpoints (`backend/api/urls.py`):

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/create-run/` | POST | Register a run (drives `validate_run` + `initialize_run`) |
| `/api/runs/<run_id>/state/` | GET | Current lifecycle state |
| `/api/runs/<run_id>/update/` | POST | Command with `RUN_CONFIRMED` / `RUN_COMPLETED` / `RUN_INTERRUPTED` / `RUN_SHORT_TURNED` / `CANCEL_RUN` |
| `/api/runs/<run_id>/history/` | GET | Lifecycle event history |

### Stale-run scanning

`scan_stale_runs` (every 30 s) iterates `runs:tracking`, comparing `runs:last_seen:<id>` against thresholds in `runs/domain/detection/thresholds.py`: grace **60 s** (IN_PROGRESS → `run_tracking_lost`, run enters No Signal) and expiry **600 s** (No Signal → `run_tracking_expired`). *(`realtime_engine/README.md` says 300 s; the source — 600 s — wins.)*

## 6. Messaging, persistence & honest status

- **Redis = authoritative real-time state** (single writer: realtime-engine; read by schedule-engine). PostgreSQL = durable domain data, traces, GTFS-RT blobs. Never use PostgreSQL for real-time decisions — read Redis.
- **AMQP (`message-broker` / RabbitMQ) is largely designed, not wired.** `backend/messages/publisher.py` `publish_event` is a **stub** that only `print()`s; the `databus.events` direct exchange and `runs.*` routing keys are sketched but not emitting. Treat command/observation/assertion message semantics as intended design, not current behavior.
- **Occupancy** `occupancy_status` is recomputed server-side via `classify_status`; the edge-provided status is discarded.
- **GTFS-RT alerts** (`build_alerts`) is a stub returning `"Feed ServiceAlert built"`. Only VehiclePosition and TripUpdate feeds are real today.
- **Celery beat schedule lives in code** (`backend/databus/celery.py`), **not** in `django_celery_beat` admin.
- GTFS-RT `timestamp` is Unix epoch **seconds**, not milliseconds.

## 7. Links to FSMs (formal process specs)

Formal process state machines live in `behavior/databus/system/` — YAML DSL in `yaml/` is canonical, XState JSON in `json/` is derived, prose in `docs/`. These are **design specs** and may lead implementation; where they reference an edge `progression` key, the as-built system computes `run:<id>:vehicle_stop_status` server-side instead.

| Process | JSON | Doc |
|---|---|---|
| `register-run` | [`json/register-run.json`](../../behavior/databus/system/json/register-run.json) | [`docs/register-run.md`](../../behavior/databus/system/docs/register-run.md) |
| `ingest-telemetry` | [`json/ingest-telemetry.json`](../../behavior/databus/system/json/ingest-telemetry.json) | [`docs/ingest-telemetry.md`](../../behavior/databus/system/docs/ingest-telemetry.md) |
| `update-system-state` | [`json/update-system-state.json`](../../behavior/databus/system/json/update-system-state.json) | [`docs/update-system-state.md`](../../behavior/databus/system/docs/update-system-state.md) |
| `build-gtfs-realtime` | [`json/build-gtfs-realtime.json`](../../behavior/databus/system/json/build-gtfs-realtime.json) | [`docs/build-gtfs-realtime.md`](../../behavior/databus/system/docs/build-gtfs-realtime.md) |
| `save-gtfs-feed-messages` | [`json/save-gtfs-feed-messages.json`](../../behavior/databus/system/json/save-gtfs-feed-messages.json) | [`docs/save-gtfs-feed-messages.md`](../../behavior/databus/system/docs/save-gtfs-feed-messages.md) |
| `end-run` | [`json/end-run.json`](../../behavior/databus/system/json/end-run.json) | [`docs/end-run.md`](../../behavior/databus/system/docs/end-run.md) |
| `run-lifecycle` | [`json/run-lifecycle.json`](../../behavior/databus/system/json/run-lifecycle.json) | [`docs/run-lifecycle.md`](../../behavior/databus/system/docs/run-lifecycle.md) |

See [`behavior/databus/system/README.md`](../../behavior/databus/system/README.md) for the process flow chart and naming conventions.

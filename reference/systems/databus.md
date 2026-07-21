**Last verified:** 2026-07-10 (as-built body against `main` @ `2b062c0`; see §7 for in-flight feature-branch work not yet on `main`)

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
- **GTFS-RT alerts** (`build_alerts`) is a stub returning `"Feed ServiceAlert built"`. On `main`, only the VehiclePosition and TripUpdate feeds are real; a GTFS **Schedule** zip producer is in-flight on a feature branch (see §7).
- **Celery beat schedule lives in code** (`backend/databus/celery.py`), **not** in `django_celery_beat` admin.
- GTFS-RT `timestamp` is Unix epoch **seconds**, not milliseconds.

## 7. In-flight work (feature branches — not yet on `main`)

> These features are implemented on feature branches and **not yet merged to `main`**, so they are not part of the as-built system described above. They are documented here so agents working the active branches have context. **Fold each into the sections above once it merges**, and delete it from here. Verified against source 2026-07-10.

### GTFS Schedule zip publishing (`feat/gtfs-schedule-publish`)

Makes databus a real **GTFS Schedule** producer (until now only the GTFS-RT feeds were real — §6). Mirrors the GTFS-RT publish pipeline:

- `backend/feed/schedule/exporter.py` — `build_gtfs_zip(feed)` serializes one Feed's rows into GTFS `.txt` files (columns derived by model introspection) and returns the zip bytes; `publish_gtfs_zip(feed)` writes `backend/feed/files/gtfs.zip` **atomically** (`.tmp` staging file + `Path.replace`).
- Source of truth is the **`feed` app's own GTFS ORM models** (`Feed`, `Agency`, `Stop`, `Route`, `Calendar`, `CalendarDate`, `Trip`, `StopTime`, `Shape`), typically loaded from `feed/fixtures/gtfs.json`. The exporter selects `Feed.objects.filter(is_current=True).first()`. *(This is the `feed` app's model set — distinct from the `gtfs`/`gtfs-django` schedule models referenced in §2/§4.)*
- `schedule_engine.tasks.build_schedule` — Celery task on queue `schedule_engine`, wired to a **daily** beat entry `build-schedule-daily` (`timedelta(days=1)` in `backend/databus/celery.py`).
- `feed export_gtfs` management command for on-demand/boot generation; `docker-entrypoint.sh` exports on boot **only if `gtfs.zip` is absent**.
- Served at **`/feed/schedule/feed.zip`** (`feed.views.schedule`); returns **404** until the zip has been generated.

### ETA-driven stop-time updates (`feat/eta-stop-times`)

Replaces the placeholder `stop_time_updates` producer with real arrival-time predictions (the `run:<id>:stop_time_updates` projection in §4 becomes model-driven).

- New **`gtfs-eta` uv workspace package** (`backend/gtfs-eta/`, namespace `gtfs_eta.*`): an **inference-only** ETA library — estimator, feature engineering, and model-registry loader. It is the vendored inference half; the canonical training source lives in `gtfs-django` (`feature/eta_prediction`). `xgboost` is an optional extra. Candidate for extraction into its own package if a second consumer appears.
- `backend/runs/domain/progression/stop_times.py` now computes the projection via `gtfs_eta.eta_service.estimator.estimate_stop_times`, reached through a single **lazy-import seam** (pure `compute_stop_time_updates` + impure `produce_stop_times` doing the Redis I/O). Upcoming stops and distances come from the monotonic shape geometry and feed the estimator's precomputed-distance hook (fixes duplicate `stop_sequence`s and non-decreasing upcoming counts).
- Model registry loaded from **`MODEL_REGISTRY_DIR`** (a `registry.json` index plus per-model `*.pkl` / `*_meta.json`), resolved **relative to the registry directory** so it is relocatable (bind-mount, checked-in placeholder, or externally retrained). Seed a deterministic baseline with `MODEL_REGISTRY_DIR=eta_models python -m gtfs_eta.seed_baseline_model`.
- New config/env: `MODEL_REGISTRY_DIR`, `ETA_MAX_STOPS` (default `3`), `ETA_DEFAULT_UNCERTAINTY_S` (default `120`).

### HTTP telemetry ingestion — pluggable sources (`feat/fetch-telemetry`) *(verified 2026-07-21)*

Lets databús **pull** vehicle telemetry from third-party HTTP APIs and relay it into the existing pipeline, for fleets whose GPS is only reachable over REST (the driving case: the **NavSat** API) rather than pushed by on-board equipment over MQTT. As-built §5 describes OBE→MQTT as the *only* ingress; this adds a second **source** while keeping the same sink.

- **Key architectural point:** the fetcher publishes onto the existing `transit/vehicle/<id>/position` MQTT contract — it does **not** write Redis directly. MQTT is the ingestion *front door*, not mere transport: the consumer (§5) does run-routing via `vehicle:<id>:current_run`, `runs:last_seen`, validation, and the `process_position_update.delay()` hand-off. So an HTTP source reuses all of that unchanged and is a *source*, never a new sink.
- **New pluggable source package** `backend/realtime_engine/sources/`:
  - `base.py` — `SourceAdapter` Protocol (`fetch(sensor) -> list[(vehicle_id, payload)]`) + a string-keyed registry (`register(kind)` / `get_adapter(kind)`). Adding a *protocol* = a new adapter class; adding an *HTTP feed* = a new `Sensor` row, no code.
  - `http_json.py` — generic adapter registered under kind `"http"`, driven entirely by a `Sensor`'s `source_http_url` + `source_json_mapping` (JSON path map + `units`/`timestamp` config). Handles array or single-object bodies; skips malformed records rather than failing the batch.
  - `transforms.py` — pure normalizers ported from the `navsat-bridge` prototype: km/h→m/s, km→m, `America/Costa_Rica`-local datetime→epoch **seconds**, plus a dotted-path getter.
  - `publisher.py` — paho-**v2** MQTT publisher to `transit/vehicle/<id>/position`, reusing the `MQTT_HOST`/`MQTT_PORT` env convention from the consumer.
- **New Celery task** `realtime_engine.tasks.fetch_positions` (queue `realtime_engine`), beat entry **`fetch-positions` every 10 s** in `backend/databus/celery.py`. Each cycle: (1) build the in-service vehicle set from vehicles that have a `vehicle:<id>:current_run` key — **the same gate the MQTT consumer uses**; (2) query `Sensor.objects.filter(status="ACTIVE", provides_position=True, source_type__in=["http","both"])`; (3) dispatch each through `get_adapter("http")`, keep readings for in-service vehicles, publish the survivors.
  - **Gate rationale (subtle):** scoping on `current_run` — not `runs:in_progress` — is deliberate. A run only reaches **In Progress** once telemetry proves the vehicle is moving (`is_vehicle_moving` guard), but for an HTTP-only vehicle that telemetry *is* what `fetch_positions` delivers. Gating on `runs:in_progress` deadlocks a **Confirmed** run; gating on `current_run` (set from Confirmed onward) lets it bootstrap Confirmed → Tracking → In Progress. Note the downstream consequence: a run sitting in **Tracking** (e.g. a parked bus) has its position in Redis but does **not** appear in the feeds until it reaches In Progress, since the builders still iterate `runs:in_progress`.
- **Data model** (`operations/models.py`): the old fat `Equipment.provides_*` flags moved to a new **`Sensor`** model (`Sensor` → `Equipment` → `Vehicle`), which also carries the source config: `source_type` (`mqtt`/`http`/`both`), `source_http_url`, `source_json_mapping`. Also: `Company.linked_agency` O2O→M2M, `Operator` role flags, `Vehicle.status` drops `SOLD`. `Sensor` registered in the Django admin.
- **NavSat specifics:** one endpoint (`…/rcu/<token>/114700/0/todos`) returns the whole fleet as a JSON array keyed by `plateNumber`; the adapter fans out to every vehicle by plate. `plateNumber` equals `Vehicle.id` for the current operator, so no plate→id lookup. (Swapping `todos` for a plate returns a 1-element array — same shape.) The `navsat-bridge` repo was only a prototype; ingestion now lives here.
- **Migrations convention:** `operations` added to `APPS_TO_MIGRATE` in `docker-entrypoint.sh` (migrations are gitignored and regenerated at container start under `DEBUG`, like the other apps). **Env:** `MQTT_HOST` / `MQTT_PORT` added to the env files (the consumer already read them).

## 8. Links to FSMs (formal process specs)

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

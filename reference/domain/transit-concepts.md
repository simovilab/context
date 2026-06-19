# Transit Concepts

Vocabulary glossary for core transit domain terms used across Databús, Infobús, and SIMOVI documentation. Each term includes its operational definition and a reference to where it is modeled in the system.

## Run

A **run** is the fundamental operational unit in Databús. It represents a single real-world assignment: one vehicle executing one scheduled trip on one calendar day, operated by one assigned operator. A run has a full lifecycle — from registration through validation, confirmation, active tracking, and terminal resolution (completed, cancelled, interrupted, or short-turned). Runs are the objects that generate VehiclePosition and TripUpdate GTFS-RT entities. Each run has its own state machine instance. See [`behavior/databus/system/json/run-lifecycle.json`](../../behavior/databus/system/json/run-lifecycle.json) for the complete lifecycle FSM, and [`behavior/databus/system/json/register-run.json`](../../behavior/databus/system/json/register-run.json) for the registration process.

## Trip

A **trip** is a GTFS Schedule concept: a specific sequence of stops served at scheduled times, belonging to a route, on a defined set of service days. Trips are static — they come from the GTFS Schedule feed and define the planned path and timing. A single trip may be executed multiple times on different days by different runs. In Databús, a run is always associated with exactly one `trip_id`, which is validated against the loaded GTFS Schedule before the run is initialized.

## Route

A **route** is a named service pattern operated by a transit agency — e.g., "Route 17 — Centro a San Pedro". A route groups many trips that share the same path and branding. In GTFS, routes have a `route_type` (bus, rail, ferry, etc.), a `route_short_name`, and a `route_long_name`. Databús validates `route_id` during run registration; Infobús uses route subscriptions to filter which vehicles and arrivals to show on each display screen.

## Stop

A **stop** is a physical boarding/alighting point with a geographic location (`stop_lat`, `stop_lon`). Stops appear in `stop_times.txt` in ordered sequences that define a trip's path. In GTFS-RT, `current_stop_sequence` in a VehiclePosition indicates where the vehicle is relative to the trip's stop sequence. Infobús applies PostGIS spatial filters to match nearby stops to each screen's location when computing display payloads.

## Vehicle

A **vehicle** is the physical transit unit (a bus, tram, etc.) executing a run. In Databús, edge-sensed vehicle state is stored in Redis under `vehicle:{id}:position`, `vehicle:{id}:occupancy`, `vehicle:{id}:metadata`, and `vehicle:{id}:current_run`. There is **no** `vehicle:{id}:progression` key — progression is decommissioned at the edge and computed server-side as `run:{id}:vehicle_stop_status` via GPS→polyline map-matching (`runs/domain/progression/compute.py`). A vehicle can only be assigned to one active run at a time; availability is checked during run registration. The vehicle's telemetry — lat, lon, bearing, speed, timestamp — flows in via MQTT (`position`/`occupancy` leaves only) and drives both the GTFS-RT feed and the run-lifecycle FSM transitions.

## Telemetry

**Telemetry** is the high-frequency positional and operational data stream emitted by on-board equipment (OBE) installed in transit vehicles. In SIMOVI, telemetry arrives via MQTT (NanoMQ broker) as raw payloads containing at minimum: `vehicle_id`, latitude, longitude, bearing, speed, and timestamp. Telemetry is the primary trigger for GTFS-RT feed generation and for run-lifecycle transitions (`run_tracking_started`, `run_started`, `run_tracking_lost`). Staleness thresholds (`runs/domain/detection/thresholds.py`, evaluated by `scan_stale_runs` every 30 s): grace **60 s** — an `In Progress` run with no telemetry fires `run_tracking_lost` and enters `No Signal`; expiry **600 s** — a `No Signal` run fires `run_tracking_expired`. (Older docs cite 300 s; the source value 600 s wins.) See [`behavior/databus/system/docs/ingest-telemetry.md`](../../behavior/databus/system/docs/ingest-telemetry.md).

## Dispatcher

A **dispatcher** is an authorized operator-role user who manages run assignments and interventions in real time. Dispatchers can register new runs, cancel or interrupt active runs, authorize short-turns, and confirm run registrations on behalf of operators. In the run-lifecycle FSM, several guards check `actor_role == "dispatcher"` (or `"system"`) before allowing state transitions. See `is_cancellation_authorized`, `is_interruption_authorized`, `is_short_turn_authorized` in [`behavior/databus/system/docs/run-lifecycle.md`](../../behavior/databus/system/docs/run-lifecycle.md).

## Operator

An **operator** is the person driving the vehicle. In Databús, an operator is assigned to a run at registration time (`operator_id`). Operators confirm their own run via the API (triggering `backend.RUN_CONFIRMED_BY_OPERATOR`). An operator cannot self-authorize cancellations or short-turns — those require dispatcher authority. The guard `is_operator_available` checks that the operator is not already assigned to another active run.

## Lifecycle (Vehicle vs. Run)

The **run lifecycle** is the FSM-governed state progression of a single Run record: `requested → validated → initialized → confirmed → tracking → in_progress → [completed | cancelled | interrupted | short_turned]`, with `no_signal` as a recoverable side-state reachable from `in_progress` (via `run_tracking_lost`) that returns on `run_tracking_restored` or terminates on `run_tracking_expired`. Note the code uses `Cancelled` (not `CANCELED`), and `run_completed` is a **detected fact**, not a command. It is modeled per-Run instance in `backend/runs/domain/lifecycle/`. See [`behavior/databus/system/json/run-lifecycle.json`](../../behavior/databus/system/json/run-lifecycle.json).

The **vehicle lifecycle** is informal and not explicitly modeled as a separate FSM — it is implied by the sequence of runs a vehicle is assigned to over time. A vehicle is "free" when it has no entry in `runs:in_progress` and no `vehicle:{id}:current_run` key in Redis. Availability is checked at run registration; resources are released when a run reaches a terminal state.

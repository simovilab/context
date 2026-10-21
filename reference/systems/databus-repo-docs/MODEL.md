> Refreshed against databus `main` @ `1be2da1` (2026-10-20). The original MODEL.md describes a target design that predates the unified Django layout (it names HiveMQ and separate `realtime-engine/`, `publisher/`, `scheduler/`, `processing/` projects). Treat it as intent only; this file records what is as-built.

# Model

- **Run** (`runs.Run`): one vehicle, one trip, one day. State machine in `backend/runs/domain/lifecycle/` (states, events, guards, actions, transitions). Authoritative live fields in Redis `run:<id>`; durable transitions in `RunLifecycleTransition`.
- **Commands** (API): create run (drives `validate_run` + `initialize_run`), confirm, interrupt, short-turn, cancel. **Detected facts** (telemetry/scan): tracking started, started, completed, tracking lost/restored/expired.
- **Transitions:** Requested→Validated→Initialized→Confirmed→Tracking→In Progress→{Completed, Interrupted, Short Turned}; In Progress↔No Signal; No Signal→Cancelled on expiry; Requested/Validated/Initialized/Confirmed/Tracking→Cancelled via rejection/cancel.
- **Telemetry:** edge sensed `position`, `occupancy` only. Server computes `vehicle_stop_status` (`STOPPED_AT` ≤20 m and speed ≤0.5 m/s, `INCOMING_AT` ≤50 m approaching, else `IN_TRANSIT_TO`; monotonic sequence floor) and ETA `stop_time_updates`.
- **Operations model:** `Company`, `Operator`, `Vehicle`, `Equipment`, `Sensor` (`source_type` mqtt/http/both).
- **Feeds:** VehiclePositions, TripUpdates (15 s), Schedule zip (daily); ServiceAlerts not implemented.
- Formal process specs live in the context repo under `behavior/databus/system/`.

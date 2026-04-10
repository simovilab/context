# 3. `update-system-state`

**Process**: `update-system-state`
**Purpose**: Load current vehicle state and validated telemetry, evaluate all state changes, write updated keys to Redis, and publish an observation if warranted.

**Actors**: `realtime_engine`, `state` (Redis), `message_broker` (RabbitMQ)

**States & transitions**:

```
waiting
  → realtime_engine.STATE_UPDATE_REQUESTED → fetching

fetching
  → realtime_engine.STATE_FETCH_SUCCEEDED → evaluating
  → realtime_engine.STATE_FETCH_FAILED    → notifying

evaluating
  → realtime_engine.STATE_EVALUATED → updating

notifying
  → realtime_engine.STATE_NOTIFICATION_SENT → waiting

updating
  → realtime_engine.STATE_UPDATE_SUCCEEDED → waiting
  → realtime_engine.STATE_UPDATE_FAILED    → notifying
```

**Events**:

| Event | Emitter | Meaning |
|---|---|---|
| `realtime_engine.STATE_UPDATE_REQUESTED` | `realtime_engine` | Validated telemetry datum ready for state evaluation |
| `realtime_engine.STATE_FETCH_SUCCEEDED` | `realtime_engine` | Current vehicle state and validated datum loaded from Redis |
| `realtime_engine.STATE_FETCH_FAILED` | `realtime_engine` | Failed to load vehicle state or validated datum from Redis |
| `realtime_engine.STATE_EVALUATED` | `realtime_engine` | Evaluation complete — position snapped, FSM run, changes recorded |
| `realtime_engine.STATE_NOTIFICATION_SENT` | `realtime_engine` | Error notification dispatched; returning to idle |
| `realtime_engine.STATE_UPDATE_SUCCEEDED` | `realtime_engine` | All Redis keys written successfully |
| `realtime_engine.STATE_UPDATE_FAILED` | `realtime_engine` | One or more Redis writes failed |

**Context**: `vehicle_id` (string | null), `run_id` (string | null), `changes` (string[]), `fsm_transition` ({ from, to } | null), `observation_required` (boolean), `error` (string | null)

**Actions reference**:

| Action | Service | Description |
|---|---|---|
| `realtime_engine.load_current_vehicle_state` | `realtime_engine` | Read `vehicle:{id}:position`, `vehicle:{id}:progression`, `vehicle:{id}:occupancy` from Redis |
| `realtime_engine.load_validated_datum` | `realtime_engine` | Retrieve the validated telemetry datum from the ingest step |
| `realtime_engine.snap_to_route_shape` | `realtime_engine` | Project new position onto the route shape geometry; calculate distance along shape for progression |
| `realtime_engine.run_fsm_logic` | `realtime_engine` | Evaluate FSM transition rules: speed, stop proximity, and dwell time determine IS_MOVING ↔ IS_STOPPED ↔ IS_PAUSED |
| `realtime_engine.determine_stop_proximity` | `realtime_engine` | Calculate distance to next stop; determine `current_stop_sequence` and `current_status` (INCOMING_AT, STOPPED_AT, IN_TRANSIT_TO) |
| `realtime_engine.calculate_derived_fields` | `realtime_engine` | Compute schedule delay (observed vs. scheduled), headway (time since last vehicle on route), dwell time at current stop |
| `realtime_engine.send_notifications` | `realtime_engine` | Dispatch error notification (e.g., alert, dead-letter queue) for fetch or write failures |
| `realtime_engine.flush_data` | `realtime_engine` | Discard payload |
| `realtime_engine.log_errors` | `realtime_engine` | Write structured error details to the application log |
| `realtime_engine.write_vehicle_position` | `realtime_engine` | Write `vehicle:{id}:position` hash to Redis (lat, lon, bearing, speed, timestamp) |
| `realtime_engine.write_vehicle_progression` | `realtime_engine` | Write `vehicle:{id}:progression` hash to Redis (trip_id, stop_sequence, current_status) |
| `realtime_engine.write_vehicle_occupancy` | `realtime_engine` | Write `vehicle:{id}:occupancy` hash to Redis (occupancy_status) — only if changed |
| `realtime_engine.update_run_metadata` | `realtime_engine` | Update `run:{id}` hash in Redis if run-level fields changed |
| `realtime_engine.publish_observation` | `realtime_engine` | Publish observation message to the `message_broker` with event type, vehicle state, and transition details |

**Responsibilities per state**:

| State | Owner | What happens here |
|---|---|---|
| `waiting` | `realtime_engine` | Idle; machine waits for a validated telemetry datum to be ready |
| `fetching` | `realtime_engine` | Loads the current vehicle state from Redis and the validated datum from the ingest pipeline |
| `evaluating` | `realtime_engine` | Snaps position to route shape; runs FSM logic; determines stop proximity; calculates derived fields; records all changes |
| `notifying` | `realtime_engine` | Handles fetch or write failures: sends notifications and logs errors before returning to idle |
| `updating` | `realtime_engine` | Writes all changed Redis keys (position, progression, occupancy, run metadata); publishes observation on success |

**Notes**:
- `realtime_engine` is the only service authorized to write to `state` (Redis)
- Evaluation covers the full state model — position, progression, occupancy, and run metadata are all in scope
- The `databus.` namespace prefix is omitted throughout for readability

**Key changes from previous spec**:
1. **Added `fetching` state** — data loading (`load_current_vehicle_state`, `load_validated_datum`) is now an explicit state between `waiting` and `evaluating`, with its own success/failure paths
2. **Added `notifying` state** — error handling is now a first-class state; both `STATE_FETCH_FAILED` and `STATE_UPDATE_FAILED` route here
3. **Removed `emitting` state** — `publish_observation` is now a transition action on `STATE_UPDATE_SUCCEEDED`; the `OBSERVATION_EMITTED` / `OBSERVATION_SKIPPED` branch is gone
4. **`snap_to_route_shape` moved** — was on the `waiting → evaluating` transition in the old spec; now an entry action of `evaluating` (fires first, before FSM logic)
5. **Removed `determine_observation_policy` action** — observation policy is no longer a discrete action; it is implicit in the `publish_observation` payload
6. **`STATE_UPDATED` renamed** to `STATE_UPDATE_SUCCEEDED`; added `STATE_UPDATE_FAILED` for write errors
7. **Added `error` to context** — tracks the most recent error string from fetch or write failures
8. **Action names normalized** — all actions renamed from `camelCase` to `snake_case` and namespaced as `realtime_engine.<action>`

---

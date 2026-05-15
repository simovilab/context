# 7. `run-lifecycle`

**Process**: `run-lifecycle`
**Purpose**: Model the complete operational lifecycle of a single Run instance — from the first FSM event fired during registration through all terminal states (completed, cancelled, interrupted, short-turned).

**Actors**: `backend`, `realtime_engine`

**States & transitions**:

```
requested
  → backend.VALIDATE_RUN  [is_gtfs_valid, is_trip_available, is_vehicle_available, is_operator_available]
      → validated   []
  → backend.RUN_REJECTED   []
      → cancelled   []

validated
  → backend.INITIALIZE_RUN  [is_run_validated]
      → initialized [update_system_state]
  → backend.RUN_REJECTED   []
      → cancelled   [release_resources]

initialized
  → backend.RUN_CONFIRMED_BY_OPERATOR []
      → confirmed []
  → backend.RUN_REJECTED  [is_cancellation_authorized]
      → cancelled [remove_from_system_state, release_resources]

confirmed
  → realtime_engine.RUN_TRACKING_STARTED [is_vehicle_tracked]
      → tracking  [add_to_tracking_set]
  → backend.CANCEL_RUN                   [is_cancellation_authorized]
      → cancelled [remove_from_system_state, release_resources]

tracking
  → realtime_engine.RUN_STARTED  [is_vehicle_moving]
      → in_progress [add_to_in_progress_set]
  → backend.CANCEL_RUN           [is_cancellation_authorized]
      → cancelled   [remove_from_tracking_set, remove_from_system_state, release_resources]

in_progress
  → realtime_engine.RUN_TRACKING_LOST  [is_telemetry_stale]
      → no_signal    [remove_from_tracking_set]
  → backend.INTERRUPT_RUN              [is_interruption_authorized]
      → interrupted  [remove_from_tracking_set, remove_from_in_progress_set, release_resources]
  → backend.SHORT_TURN_RUN             [is_short_turn_authorized, is_short_turn_geometrically_valid]
      → short_turned [remove_from_tracking_set, remove_from_in_progress_set, release_resources]
  → realtime_engine.COMPLETE_RUN       [is_at_terminal_stop]
      → completed    [remove_from_tracking_set, remove_from_in_progress_set, release_resources]

no_signal
  → realtime_engine.RUN_TRACKING_RESTORED [is_telemetry_fresh, is_vehicle_tracked]
      → in_progress [add_to_tracking_set, add_to_in_progress_set]
  → realtime_engine.RUN_TRACKING_EXPIRED  [is_telemetry_grace_period_exceeded]
      → cancelled   [remove_from_in_progress_set, release_resources]

completed    [final]
cancelled    [final]
interrupted  [final]
short_turned [final]
```

**Events**:

| Event | Emitter | Guards | Meaning |
|---|---|---|---|
| `backend.VALIDATE_RUN` | `backend` | `is_gtfs_valid`, `is_trip_available`, `is_vehicle_available`, `is_operator_available` | `CreateRunViewSet` fires `RunLifecycleService.process_event(VALIDATE_RUN)`. Guards check GTFS validity and resource availability. |
| `backend.INITIALIZE_RUN` | `backend` | `is_run_validated` | `CreateRunViewSet` fires `RunLifecycleService.process_event(INITIALIZE_RUN)` immediately after `VALIDATE_RUN` succeeds. Guard confirms validation state is set before writing to Redis. |
| `backend.RUN_REJECTED` | `backend` | _(none from `requested` or `validated`)_; `is_cancellation_authorized` (from `initialized`) | Explicit rejection at validation or initialization stage, or operator-initiated cancellation before confirmation. Rejection reason must be recorded in payload where applicable. |
| `backend.RUN_CONFIRMED_BY_OPERATOR` | `backend` | _(none)_ | `UpdateRunViewSet` receives confirmation from operator or dispatcher. No authorization guard required. |
| `backend.CANCEL_RUN` | `backend` | `is_cancellation_authorized` | `UpdateRunViewSet` receives cancellation request from `confirmed` or `tracking`. Actor must be dispatcher or the run's own operator. |
| `backend.INTERRUPT_RUN` | `backend` | `is_interruption_authorized` | `UpdateRunViewSet` receives interruption request. Same authority check as cancellation. |
| `backend.SHORT_TURN_RUN` | `backend` | `is_short_turn_authorized`, `is_short_turn_geometrically_valid` | `UpdateRunViewSet` receives short-turn request. Requires dispatcher/system authority and a geometrically valid early-termination stop. |
| `realtime_engine.RUN_TRACKING_STARTED` | `realtime_engine` | `is_vehicle_tracked` | Telemetry consumer detects first valid ping for a CONFIRMED run; fires `run_lifecycle_event` Celery task. |
| `realtime_engine.RUN_STARTED` | `realtime_engine` | `is_vehicle_moving` | Telemetry consumer detects vehicle is actively moving along the route. |
| `realtime_engine.RUN_TRACKING_LOST` | `realtime_engine` | `is_telemetry_stale` | `scan_stale_runs` beat task detects `runs:last_seen:{run_id}` has gone silent beyond `TELEMETRY_GRACE_S` (60 s). Only fired from `in_progress`; tracking loss before the run starts is not modelled. |
| `realtime_engine.RUN_TRACKING_RESTORED` | `realtime_engine` | `is_telemetry_fresh`, `is_vehicle_tracked` | Telemetry consumer receives a ping for a NO_SIGNAL run. Returns directly to `in_progress` — the run was already active when signal was lost. |
| `realtime_engine.RUN_TRACKING_EXPIRED` | `realtime_engine` | `is_telemetry_grace_period_exceeded` | `scan_stale_runs` beat task detects no telemetry beyond the hard expiry threshold `TELEMETRY_EXPIRY_S` (300 s). Transitions to `cancelled`. |
| `realtime_engine.COMPLETE_RUN` | `realtime_engine` | `is_at_terminal_stop` | Telemetry consumer detects vehicle has arrived at the terminal stop of the scheduled trip. |

**Context**: `run_id` (UUID | null), `vehicle_id` (UUID | null), `trip_id` (string | null), `actor_id` (UUID | null), `actor_role` (string | null), `reason` (string | null), `stop_id` (string | null), `short_turn_stop_id` (string | null), `last_seen_at` (ISO-8601 | null), `rejection_reason` (string | null), `error` (string | null)

**Guards reference**:

| Guard | Service | Description |
|---|---|---|
| `backend.is_gtfs_valid` | `backend` | Checks `route_id`, `trip_id`, `direction_id`, `shape_id`, `schedule_relationship` against the current GTFS feed in the database. Raises `RunLifecycleError` with field-level errors on failure. |
| `backend.is_trip_available` | `backend` | Checks Redis system state to confirm the trip is not already assigned to another active run at the same time. Placeholder. |
| `backend.is_vehicle_available` | `backend` | Checks Redis system state to confirm the vehicle is not already assigned to another active run at the same time. Placeholder. |
| `backend.is_operator_available` | `backend` | Checks Redis system state to confirm the operator is not already assigned to another active run at the same time. Placeholder. |
| `backend.is_run_validated` | `backend` | Confirms the run record has passed GTFS and availability checks before advancing to `initialized`. Placeholder. |
| `backend.is_cancellation_authorized` | `backend` | Confirms `payload["actor_role"]` is `"dispatcher"` or `"system"`, or `actor_id` matches the run's assigned operator. Placeholder. |
| `backend.is_interruption_authorized` | `backend` | Same authority check as `is_cancellation_authorized`; may additionally require a minimum in-progress duration. Placeholder. |
| `backend.is_short_turn_authorized` | `backend` | Verifies `actor_role` is `"dispatcher"` or `"system"` — operators cannot self-authorize a short-turn. Placeholder. |
| `backend.is_short_turn_geometrically_valid` | `backend` | Confirms `payload["short_turn_stop_id"]` appears in the trip's stop sequence and is not the terminal stop. Placeholder. |
| `backend.is_vehicle_tracked` | `backend` | `r.sismember("runs:tracking", run.id)` — verifies the run is currently in the Redis tracking set. |
| `backend.is_vehicle_moving` | `backend` | Confirms the vehicle is actively moving along the route based on telemetry data. Placeholder. |
| `backend.is_telemetry_stale` | `backend` | No telemetry ping received for > `TELEMETRY_GRACE_S` (60 s) based on `payload["last_seen_at"]`. Placeholder. |
| `backend.is_telemetry_fresh` | `backend` | Inverse of `is_telemetry_stale` — ping received within `TELEMETRY_GRACE_S` (60 s). Placeholder. |
| `backend.is_telemetry_grace_period_exceeded` | `backend` | No ping received for > `TELEMETRY_EXPIRY_S` (300 s) based on `payload["last_seen_at"]`. Placeholder. |
| `backend.is_at_terminal_stop` | `backend` | Confirms `payload["stop_id"]` matches the last stop in the trip's GTFS stop sequence. Placeholder. |

**Actions reference**:

| Action | Service | Description |
|---|---|---|
| `backend.update_system_state` | `backend` | Write run fields (`route_id`, `trip_id`, `direction_id`, `shape_id`, `schedule_relationship`, `run_lifecycle_state`) to `run:{run_id}` Redis hash. Placeholder. |
| `backend.add_to_tracking_set` | `backend` | `r.sadd("runs:tracking", run_id)`. Placeholder. |
| `backend.remove_from_tracking_set` | `backend` | `r.srem("runs:tracking", run_id)`. Placeholder. |
| `backend.add_to_in_progress_set` | `backend` | `r.sadd("runs:in_progress", run_id)`. Placeholder. |
| `backend.remove_from_in_progress_set` | `backend` | `r.srem("runs:in_progress", run_id)`. Placeholder. |
| `backend.remove_from_system_state` | `backend` | Delete `run:{run_id}` hash and remove from all Redis sets in a pipeline. Placeholder. |
| `backend.release_resources` | `backend` | Delete `vehicle:{id}:current_run` and `operator:{id}:current_run` Redis keys so those assets are available for a new run. Placeholder. |

**Responsibilities per state**:

| State | Owner | What happens here |
|---|---|---|
| `requested` | `backend` | Run record exists in PostgreSQL with `run_lifecycle_state = REQUESTED`. Awaiting GTFS and availability guard check via `VALIDATE_RUN`. |
| `validated` | `backend` | GTFS and availability guards passed. Awaiting system state initialization (Redis write) via `INITIALIZE_RUN`. |
| `initialized` | `backend` | Run metadata written to Redis. Awaiting operator confirmation via API. |
| `confirmed` | `backend` + `realtime_engine` | Operator confirmed. Awaiting first GPS telemetry ping from the vehicle. |
| `tracking` | `realtime_engine` | Vehicle is emitting telemetry. Run is in the `runs:tracking` Redis set. Awaiting movement detection to declare the run in progress. |
| `in_progress` | `realtime_engine` | Vehicle is actively moving along the route. Run is in both `runs:tracking` and `runs:in_progress`. Normal deviations (interruption, short-turn, signal loss, completion) are handled here. |
| `no_signal` | `realtime_engine` | Telemetry has gone silent. Grace period is active. Run remains in the `runs:in_progress` set. If signal resumes before expiry, returns to `in_progress`. If expiry is hit, transitions to `cancelled`. |
| `completed` | — | Terminal. Vehicle reached the terminal stop of the scheduled trip. Resources released. |
| `cancelled` | — | Terminal. Run was cancelled before completing, rejected during registration, or expired while in no-signal state. |
| `interrupted` | — | Terminal. Run was stopped mid-execution by operator or dispatcher request. |
| `short_turned` | — | Terminal. Run was ended early at a stop before the terminal, with dispatcher authorization. |

**Notes**:

- This machine is instantiated per `Run` record. Each Run has its own lifecycle state stored in `run.run_lifecycle_state` (PostgreSQL).
- `backend.VALIDATE_RUN` and `backend.INITIALIZE_RUN` are both fired synchronously within a single `POST /runs` HTTP call (see `register-run`). From this machine's perspective they are sequential events with no waiting between them.
- All `backend.*` events are fired either by `CreateRunViewSet` (for `VALIDATE_RUN`, `INITIALIZE_RUN`) or `UpdateRunViewSet` (all others). Both call `RunLifecycleService.process_event()`.
- All `realtime_engine.*` events are fired via the `run_lifecycle_event` Celery task, which also calls `RunLifecycleService.process_event()`. The FSM engine is the same; only the caller differs.
- `persist_lifecycle_event` and `update_run_lifecycle_state` are no longer declared as FSM transition actions — these responsibilities have been lifted to the service layer that wraps the FSM.
- All `publish_*` AMQP actions have been removed from FSM transition declarations. Event publishing is now handled outside the transition table.
- Tracking loss (`RUN_TRACKING_LOST`) is only modelled from `in_progress`. Signal loss before the run starts moving (while in `tracking`) is not handled; only `CANCEL_RUN` is available from that state.
- During `no_signal`, the run remains in the `runs:in_progress` Redis set. The set is only cleared upon expiry (`RUN_TRACKING_EXPIRED`) or terminal transitions from `in_progress`.
- Guards marked **Placeholder** have stub implementations returning `True`. See `context/phase2.md` for implementation instructions.
- Actions marked **Placeholder** have stub implementations returning `True`. See `context/phase3.md` for implementation instructions.
- Telemetry thresholds: `TELEMETRY_GRACE_S = 60` (stale → `no_signal`), `TELEMETRY_EXPIRY_S = 300` (expired → `cancelled`). Defined in `backend/runs/domain/guards.py`.
- `realtime_engine` events depend on Phase 4 (telemetry consumer + `scan_stale_runs` beat task). Until that is deployed, `confirmed`, `tracking`, `in_progress`, and `no_signal` transitions driven by telemetry will not fire automatically.
- The `databus.` namespace prefix is omitted throughout for readability. Prepend per `README.md` naming conventions if required.

**Key changes from previous spec**:

1. **Event renames** — Six events renamed to verb-first imperative form: `RUN_REQUESTED` → `VALIDATE_RUN`, `RUN_VALIDATED` → `INITIALIZE_RUN`, `RUN_CANCELLED` → `CANCEL_RUN`, `RUN_INTERRUPTED` → `INTERRUPT_RUN`, `RUN_SHORT_TURNED` → `SHORT_TURN_RUN`, `RUN_COMPLETED` → `COMPLETE_RUN`. `RUN_REJECTED` and all `realtime_engine.*` tracking events retain their names.
2. **Guard renames** — `is_system_state_updated` → `is_run_validated` (on `VALIDATED → INITIALIZE_RUN`); `is_run_in_progress` → `is_vehicle_moving` (on `TRACKING → RUN_STARTED`).
3. **Guards removed** — `is_validation_failure_recorded`, `is_initialization_failure_recorded`, and `is_confirmation_failure_recorded` dropped. Rejection from `requested` and `validated` is now unconditional; the `initialized → cancelled` path uses `is_cancellation_authorized` instead.
4. **`persist_lifecycle_event` and `update_run_lifecycle_state` removed from all transitions** — lifted to the service layer; no longer declared in the FSM.
5. **All `publish_*` actions removed from all transitions** — `publish_run_rejected`, `publish_run_cancelled`, `publish_tracking_lost`, `publish_run_interrupted`, `publish_run_short_turned`, `publish_run_completed`, `publish_tracking_restored` removed. Publishing is handled outside the FSM.
6. **`CONFIRMED → RUN_REJECTED` path removed** — the confirmation-failure edge from `confirmed` is gone. `confirmed` now only exits via `RUN_TRACKING_STARTED` or `CANCEL_RUN`.
7. **`TRACKING → RUN_TRACKING_LOST` path removed** — tracking loss is now only modelled from `in_progress`. Signal loss before the run starts moving is not handled by the FSM.
8. **`INITIALIZED → CANCELLED` now uses `backend.RUN_REJECTED`** — the cancellation path from `initialized` uses the `RUN_REJECTED` event (not `CANCEL_RUN`), guarded by `is_cancellation_authorized`.
9. **`NO_SIGNAL → RUN_TRACKING_EXPIRED` targets `cancelled`** — previously targeted `interrupted`. Signal expiry is now classified as a cancellation, not an operational interruption.
10. **`IN_PROGRESS → SHORT_TURNED` now includes `remove_from_tracking_set`** — ensures the run is removed from the tracking set on short-turn; this was missing in the previous spec.
11. **`IN_PROGRESS → NO_SIGNAL` no longer removes from `in_progress` set** — run stays in `runs:in_progress` during `no_signal`. Cleanup of this set is deferred to terminal transitions or expiry.

---

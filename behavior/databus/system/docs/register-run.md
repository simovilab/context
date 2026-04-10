# 1. `register-run`

**Process**: `register-run`
**Purpose**: Register a new run in the system, from API submission through validation, initialization, and operator confirmation.

**Actors**: `backend`, `realtime_engine`, `state` (Redis), `store` (PostgreSQL)

**States & transitions**:

```
waiting
  → backend.RUN_SUBMISSION_REQUESTED → submitting

submitting
  → backend.RUN_SUBMISSION_SUCCEEDED → validating
  → backend.RUN_SUBMISSION_FAILED → notifying

validating
  → realtime_engine.RUN_VALIDATION_SUCCEEDED → initializing
  → realtime_engine.RUN_VALIDATION_FAILED → notifying

initializing
  → realtime_engine.RUN_INITIALIZATION_SUCCEEDED → confirming
  → realtime_engine.RUN_INITIALIZATION_FAILED → notifying

confirming
  → realtime_engine.RUN_CONFIRMATION_SUCCEEDED → waiting [start_run]
  → realtime_engine.RUN_CONFIRMATION_FAILED → notifying

notifying
  → backend.RUN_NOTIFICATION_SENT → waiting
```

**Events**:

| Event | Emitter | Meaning |
|---|---|---|
| `backend.RUN_SUBMISSION_REQUESTED` | `backend` | API call received to register a run |
| `backend.RUN_SUBMISSION_SUCCEEDED` | `backend` | Payload valid and run command published to RabbitMQ |
| `backend.RUN_SUBMISSION_FAILED` | `backend` | Payload invalid or publish failed |
| `realtime_engine.RUN_VALIDATION_SUCCEEDED` | `realtime_engine` | Run passes all operational checks |
| `realtime_engine.RUN_VALIDATION_FAILED` | `realtime_engine` | Run fails operational or schedule validation |
| `realtime_engine.RUN_INITIALIZATION_SUCCEEDED` | `realtime_engine` | Run metadata written to Redis |
| `realtime_engine.RUN_INITIALIZATION_FAILED` | `realtime_engine` | Redis write failed |
| `realtime_engine.RUN_CONFIRMATION_SUCCEEDED` | `realtime_engine` | Operator confirmed the run |
| `realtime_engine.RUN_CONFIRMATION_FAILED` | `realtime_engine` | Operator rejected or confirmation timed out |
| `backend.RUN_NOTIFICATION_SENT` | `backend` | Failure notification delivered to caller |

**Context**: `run_id` (string | null), `vehicle_id` (string | null), `trip_id` (string | null), `result` ("accepted" | "rejected" | null), `rejection_reason` (string | null), `error` (string | null)

**Actions reference**:

| Action | Service | Description |
|---|---|---|
| `backend.validate_payload` | `backend` | Validate the HTTP request body — required fields: `vehicle_id`, `trip_id`, `route_id`, `start_time` |
| `backend.send_run_validation_request` | `backend` | Publish command to validate submitted run to RabbitMQ |
| `realtime_engine.check_vehicle_availability` | `realtime_engine` | Check Redis `runs:in_progress` — is this vehicle already on an active run? |
| `realtime_engine.check_trip_availability` | `realtime_engine` | Check Redis — is this trip already assigned to another active run? |
| `realtime_engine.validate_schedule` | `realtime_engine` | Validate against GTFS schedule: does the trip exist? Is the service active today per `calendar` + `calendar_dates`? |
| `realtime_engine.write_run_metadata` | `realtime_engine` | Add `run_id` to `runs:in_progress` in Redis. Write `run:{id}` hash (vehicle_id, trip_id, route_id, start_time, status).|
| `realtime_engine.emit_initialization_observation` | `realtime_engine` | Emit observation to `message_broker` confirming run initialization |
| `backend.request_operator_confirmation` | `backend` | Send confirmation request to the operator |
| `realtime_engine.start_run` | `realtime_engine` | Officially activate the run in Redis — update run status to `active`. Emit observation to `message_broker` |
| `backend.send_notifications` | `backend` | Notify the original HTTP caller with the reason of failure |
| `realtime_engine.flush_data` | `realtime_engine` | Clean up transient Redis state for the failed run (remove partial keys) |
| `backend.log_errors` | `backend` | Log error details for observability and debugging |

**Responsibilities per state**:

| State | Owner | What happens here |
|---|---|---|
| `waiting` | — | Idle. Machine is ready to receive a new run submission. |
| `submitting` | `backend` | Validates the incoming HTTP payload and publishes the run validation command to RabbitMQ. |
| `validating` | `realtime_engine` | Checks operational feasibility: vehicle availability, trip availability, and GTFS schedule validity. |
| `initializing` | `realtime_engine` | Writes run and vehicle metadata to Redis and emits an initialization observation to RabbitMQ. |
| `confirming` | `backend` + `realtime_engine` | Awaits operator approval. On confirmation, `realtime_engine` activates the run. |
| `notifying` | `backend` + `realtime_engine` | Handles failure outcomes: flushes partial Redis state, sends failure notifications, and logs errors. |

**Notes**:

- Validation lives in `realtime_engine` because it holds authoritative operational state (Redis).
- The `confirming` state introduces an operator gate before a run is activated — the machine does not auto-start on initialization.
- `notifying` is exclusively a failure handler. The success path exits from `confirming → waiting` via `realtime_engine.start_run`.
- `realtime_engine` is the only service authorized to write to Redis (state layer) — see README.
- The `databus.` namespace prefix is omitted throughout for readability. Prepend per `databus_system_processes.md` if required.

**Key changes from previous spec**:

1. **`requesting` renamed to `submitting`** — clearer intent; the state submits a validation request, not just requests a run.
2. **`confirming` state added** — new operator confirmation gate between `initializing` and final activation. Runs are no longer auto-activated on initialization.
3. **Explicit failure events at each step** — `RUN_SUBMISSION_FAILED`, `RUN_VALIDATION_FAILED`, `RUN_INITIALIZATION_FAILED`, `RUN_CONFIRMATION_FAILED` all route to `notifying`. Previously only `RUN_REJECTED` existed.
4. **`notifying` is now failure-only** — success exits from `confirming` directly back to `waiting`. Old spec had `notifying` serve both success and failure.
5. **All actions namespaced to owning service** — e.g., `validatePayload` → `backend.validate_payload`, `checkVehicleAvailability` → `realtime_engine.check_vehicle_availability`.
6. **`error` field added to context** — to track failure messages across the new failure-path events.
7. **Typo fixed** — `RUN_VALIDATION_SUCCEDED` → `RUN_VALIDATION_SUCCEEDED` in the JSON source.

---

# 6. `end-run`

**Process**: `end-run`
**Purpose**: Terminate an active run, whether triggered externally (dispatcher API call) or internally (realtime-engine decision).

**Actors**: `backend`, `realtime_engine`, `state` (Redis), `store` (PostgreSQL)

**States & transitions**:

```
waiting
  → backend.END_RUN_REQUESTED → submitting
  → realtime_engine.END_RUN_TRIGGERED → validating

submitting
  → backend.END_RUN_SUBMISSION_SUCCEEDED → validating
  → backend.END_RUN_SUBMISSION_FAILED → notifying

validating
  → realtime_engine.RUN_VALIDATION_SUCCEEDED → finalizing
  → realtime_engine.RUN_VALIDATION_FAILED → notifying

finalizing
  → realtime_engine.RUN_FINALIZATION_SUCCEEDED → waiting [backend.end_run]
  → realtime_engine.RUN_FINALIZATION_FAILED → notifying

notifying
  → backend.END_RUN_NOTIFICATION_SENT → waiting
```

**Events**:

| Event | Emitter | Meaning |
|---|---|---|
| `backend.END_RUN_REQUESTED` | `backend` | API call received to end a run |
| `realtime_engine.END_RUN_TRIGGERED` | `realtime_engine` | Engine autonomously decides to end the run (timeout, anomaly, trip complete) |
| `backend.END_RUN_SUBMISSION_SUCCEEDED` | `backend` | HTTP payload validated and end-run command published to RabbitMQ |
| `backend.END_RUN_SUBMISSION_FAILED` | `backend` | HTTP payload validation failed or command could not be published |
| `realtime_engine.RUN_VALIDATION_SUCCEEDED` | `realtime_engine` | Run confirmed active and eligible for finalization |
| `realtime_engine.RUN_VALIDATION_FAILED` | `realtime_engine` | Run not found or not in an active state |
| `realtime_engine.RUN_FINALIZATION_SUCCEEDED` | `realtime_engine` | Redis cleanup and trace persistence completed successfully |
| `realtime_engine.RUN_FINALIZATION_FAILED` | `realtime_engine` | Finalization failed (partial cleanup, write error, etc.) |
| `backend.END_RUN_NOTIFICATION_SENT` | `backend` | Failure notification delivered; machine returns to idle |

**Context**: `run_id` (string | null), `vehicle_id` (string | null), `trigger` ("external" | "internal" | null), `reason` (string | null), `error` (string | null)

**Actions reference**:

| Action | Service | Description |
|---|---|---|
| `backend.validate_payload` | `backend` | Validate the HTTP request |
| `realtime_engine.validate_end_run_request` | `realtime_engine` | Confirm `run_id` exists in `runs:in_progress` in Redis and the run is currently active |
| `realtime_engine.remove_run_from_active_set` | `realtime_engine` | Remove `run_id` from the `runs:in_progress` set in Redis |
| `realtime_engine.delete_run_hash` | `realtime_engine` | Delete `run:{id}` hash from Redis (which includes the vehicle keys (pos, prog, occ)) |
| `backend.end_run` | `backend` | Respond to HTTP caller if externally triggered. Broadcast run termination to consumers |
| `backend.send_notifications` | `backend` | Dispatch failure notifications to interested parties |
| `realtime_engine.flush_data` | `realtime_engine` | Discard payload (IF there is a payload to discard)|
| `backend.log_errors` | `backend` | Log the failure outcome for observability and debugging |

**Responsibilities per state**:

| State | Owner | What happens here |
|---|---|---|
| `waiting` | — | Idle. Accepts external trigger (via `backend`) or internal trigger (via `realtime_engine`). |
| `submitting` | `backend` | Validates the HTTP payload and publishes the end-run command to RabbitMQ. |
| `validating` | `realtime_engine` | Confirms the run exists in `runs:in_progress` and is eligible for finalization. |
| `finalizing` | `realtime_engine` | Removes run from active set, deletes vehicle keys and run hash from Redis |
| `notifying` | `backend` | Failure-only handler: sends failure notifications and logs errors before returning to idle. |

**Notes**:

- Two entry paths converge at `validating`: external goes through `submitting` first (payload validation); internal (`END_RUN_TRIGGERED`) skips straight to `validating`.
- `notifying` is exclusively a failure handler. The success path exits `finalizing → waiting` directly via `backend.end_run`.
- `backend.end_run` consolidates the success-path backend work: responding to the HTTP caller (if external), and broadcasting termination.
- `realtime_engine` is the only service authorized to write to Redis (state layer) — see README.
- The `databus.` namespace prefix is omitted throughout for readability. Prepend per README naming conventions if required.

**Key changes from previous spec**:

1. **`finalizing` success now exits to `waiting` directly** — previously both success and failure routed to `notifying`. Success now bypasses `notifying` entirely (same pattern as `register-run`).
2. **`notifying` is now failure-only** — the old spec used `trigger` and `error` context to distinguish success from failure inside `notifying`. That distinction is gone; `notifying` only handles failures now.
3. **`backend.end_run` consolidates success-path backend actions** — old spec had separate `update_run_record`, `respond_to_http_caller`, `broadcast_termination`, and `clear_context` on `notifying → waiting`. These are now a single `backend.end_run` action on `finalizing → waiting`.
4. **Actions removed from wired topology** — `set_trigger_external`, `set_trigger_internal`, `assign_context`, `assign_error`, `publish_end_run_command`, `emit_finalization_observation` appeared in the old spec but are not wired to any state in the current machine body. Removed from this spec.
5. **All actions namespaced to owning service** — e.g., `validatePayload` → `backend.validate_payload`, `removeRunFromActiveSet` → `realtime_engine.remove_run_from_active_set`.
6. **Machine id fixed** — `end_run_with_actions` → `end-run` (kebab-case).
7. **`.withConfig()` block removed** — machine is a reference spec; action implementations live in the Python service codebases.
8. **`databus.` prefix dropped** — omitted throughout per skill convention.

---

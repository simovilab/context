# 2. `ingest-telemetry`

**Process**: `ingest-telemetry`
**Purpose**: Receive raw vehicle telemetry from OBE devices, validate it, and accept it for downstream processing.

**Actors**: `telemetry_broker`, `realtime_engine`

**States & transitions**:

```
waiting
  → telemetry_broker.TELEMETRY_RECEIVED → validating

validating
  → realtime_engine.TELEMETRY_VALIDATION_SUCCEEDED → processing
  → realtime_engine.TELEMETRY_VALIDATION_FAILED → notifying

processing
  → realtime_engine.TELEMETRY_PROCESSING_SUCCEEDED → waiting
  → realtime_engine.TELEMETRY_PROCESSING_FAILED → notifying

notifying
  → realtime_engine.TELEMETRY_NOTIFICATION_SENT → waiting
```

**Events**:

| Event | Emitter | Meaning |
|---|---|---|
| `telemetry_broker.TELEMETRY_RECEIVED` | `telemetry_broker` | MQTT message forwarded to realtime-engine |
| `realtime_engine.TELEMETRY_VALIDATION_SUCCEEDED` | `realtime_engine` | Payload is well-formed, vehicle is on an active run, coordinates are plausible |
| `realtime_engine.TELEMETRY_VALIDATION_FAILED` | `realtime_engine` | Payload fails validation (unknown vehicle, no active run, out of bounds, stale timestamp) |
| `realtime_engine.TELEMETRY_PROCESSING_SUCCEEDED` | `realtime_engine` | Datum normalized and associated with run context |
| `realtime_engine.TELEMETRY_PROCESSING_FAILED` | `realtime_engine` | Normalization or context association failed |
| `realtime_engine.TELEMETRY_NOTIFICATION_SENT` | `realtime_engine` | Failure notifications dispatched; machine ready to reset |

**Context**: `vehicle_id`, `run_id`, `trip_id`, `route_id`, `raw_payload`, `discard_reason`, `error`

**Actions reference**:

| Action | Service | Description |
|---|---|---|
| `parse_mqtt_payload` | `realtime_engine` | Extract lat, lon, bearing, speed, timestamp, vehicle_id from raw MQTT message |
| `check_active_run` | `realtime_engine` | Look up vehicle_id in Redis `runs:in_progress` — is there an active run for this vehicle? |
| `validate_coordinates` | `realtime_engine` | Check coordinates are within expected geographic bounds |
| `validate_timestamp` | `realtime_engine` | Verify timestamp is not stale (>**N** s old) or in the future |
| `normalize_payload` | `realtime_engine` | Apply unit conversions, coordinate precision normalization |
| `associate_run_context` | `realtime_engine` | Enrich datum with active run context from Redis (`trip_id`, `route_id`) |
| `mark_ready_for_state_update` | `realtime_engine` | Signal that the datum is ready for downstream consumption by `update_system_state` |
| `request_state_update` | `realtime_engine` | Trigger downstream `update_system_state` process with the processed datum |
| `send_notifications` | `realtime_engine` | Dispatch failure notifications (discarded datum or processing error) |
| `flush_data` | `realtime_engine` | Discard payload |
| `log_errors` | `realtime_engine` | Log errors for debugging and auditing |

**Responsibilities per state**:

| State | Owner | What happens here |
|---|---|---|
| `waiting` | — | Idle. Awaiting next telemetry message from `telemetry_broker`. |
| `validating` | `realtime_engine` | Parse and validate raw MQTT payload: check vehicle has an active run, coordinates are in bounds, timestamp is fresh. |
| `processing` | `realtime_engine` | Normalize the validated datum. Associate it with active run context (`trip_id`, `route_id`) from Redis. Mark ready for `update_system_state`. |
| `notifying` | `realtime_engine` | Handle validation or processing failures: dispatch notifications, log errors, flush data, then return to `waiting`. |

**Notes**:
- Raw telemetry is **untrusted signal** — validation is mandatory before any state changes
- This process is deliberately thin: it only covers getting data in the door
- Interpretation of the telemetry (FSM transitions, Redis writes) belongs to `update_system_state`
- Both failure paths (`validating → notifying` and `processing → notifying`) converge in `notifying` before resetting to `waiting`
- The `databus.` namespace prefix is omitted for readability.


**Key changes from previous spec**:
1. Machine id: `ingest_telemetry` → `ingest-telemetry` (kebab-case per naming conventions)
2. Added `notifying` state: both failure paths now converge here before returning to `waiting` (previously `TELEMETRY_DISCARDED` went directly back to `waiting`)
3. Events renamed: `TELEMETRY_VALIDATED` → `TELEMETRY_VALIDATION_SUCCEEDED`, `TELEMETRY_DISCARDED` → `TELEMETRY_VALIDATION_FAILED`, `TELEMETRY_PROCESSED` → `TELEMETRY_PROCESSING_SUCCEEDED`
4. New events added: `TELEMETRY_PROCESSING_FAILED`, `TELEMETRY_NOTIFICATION_SENT`
5. Actions moved from transition `actions` arrays to state `entry` arrays (fire on state entry rather than on event)
6. Action names renamed from `camelCase` to `realtime_engine.<action>` snake_case per naming conventions
7. Added `error` to context for processing failure propagation
8. Completed action wiring on failure transitions: `set_discard_reason` on `validating → notifying`, `assign_error` on `processing → notifying`, `clear_context` on `notifying → waiting` (these were stubbed in the previous `.withConfig()` block but not wired into the topology)
9. Migrated from XState v4 (`createMachine` + `.withConfig()`) to v5 (`setup()` + `.createMachine()`)

---

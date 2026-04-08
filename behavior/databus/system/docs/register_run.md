# 1. `register_run`
 
**Purpose**: Register a new run in the system, from API request through validation and initialization.
 
**Actors**: `backend`, `realtime_engine`, `state` (Redis), `store` (PostgreSQL)
 
**States & transitions**:
 
```
waiting
  → RUN_REQUESTED → requesting
 
requesting
  → RUN_VALIDATION_REQUESTED → validating
 
validating
  → RUN_ACCEPTED → initializing
  → RUN_REJECTED → notifying
 
initializing
  → RUN_INITIALIZED → notifying
 
notifying
  → RUN_NOTIFICATION_SENT → waiting
```
 
**Events**:
 
| Event | Emitter | Meaning |
|---|---|---|
| `RUN_REQUESTED` | `backend` | API call received to register a run |
| `RUN_VALIDATION_REQUESTED` | `backend` | Command published to RabbitMQ for realtime-engine |
| `RUN_ACCEPTED` | `realtime_engine` | Run passes operational validation (Redis checks) |
| `RUN_REJECTED` | `realtime_engine` | Run fails operational validation |
| `RUN_INITIALIZED` | `realtime_engine` | Run metadata written to Redis |
| `RUN_NOTIFICATION_SENT` | `backend` | API caller notified of the outcome |
 
**Context**: `run_id`, `vehicle_id`, `trip_id`, `result` (`accepted` | `rejected`), `rejection_reason` (optional)
 
**Actions per transition**:
 
| Transition | Actions |
|---|---|
| `waiting → requesting` | Validate HTTP payload (required: vehicle_id, trip_id, route_id, start_time). Create `Run` record in PostgreSQL with status `pending`. Assign `run_id`, `vehicle_id`, `trip_id` to context. |
| `requesting → validating` | Publish run command to RabbitMQ. Realtime-engine receives command. Check Redis: is vehicle already in `runs:in_progress`? Check Redis: is trip already assigned to another active run? Validate against GTFS schedule: does trip exist, is service active today (calendar + calendar_dates)? |
| `validating → initializing` | Set `result: "accepted"` in context. |
| `validating → notifying` | Set `result: "rejected"` and `rejection_reason` in context. Emit observation to RabbitMQ with rejection details. |
| `initializing → notifying` | Add `run_id` to `runs:in_progress` set in Redis. Write `run:{id}` hash (vehicle_id, trip_id, route_id, start_time, status). Write `vehicle:{id}:data` hash (initial metadata). Emit observation to RabbitMQ confirming initialization. |
| `notifying → waiting` | Backend receives observation from RabbitMQ. Update `Run` record in PostgreSQL (status → `active` or `rejected`). Respond to original HTTP caller with result. |
 
**XState definition**:
 
```json
{
  "id": "register_run",
  "initial": "waiting",
  "context": {
    "run_id": null,
    "vehicle_id": null,
    "trip_id": null,
    "result": null,
    "rejection_reason": null
  },
  "states": {
    "waiting": {
      "on": {
        "backend.RUN_REQUESTED": {
          "target": "requesting",
          "actions": ["validatePayload", "createPendingRun", "assignContext"]
        }
      }
    },
    "requesting": {
      "on": {
        "backend.RUN_VALIDATION_REQUESTED": {
          "target": "validating",
          "actions": ["publishRunCommand", "checkVehicleAvailability", "checkTripAvailability", "validateSchedule"]
        }
      }
    },
    "validating": {
      "on": {
        "realtime_engine.RUN_ACCEPTED": {
          "target": "initializing",
          "actions": ["setResultAccepted"]
        },
        "realtime_engine.RUN_REJECTED": {
          "target": "notifying",
          "actions": ["setResultRejected", "emitRejectionObservation"]
        }
      }
    },
    "initializing": {
      "on": {
        "realtime_engine.RUN_INITIALIZED": {
          "target": "notifying",
          "actions": ["addRunToActiveSet", "writeRunMetadata", "writeVehicleMetadata", "emitInitializationObservation"]
        }
      }
    },
    "notifying": {
      "on": {
        "backend.RUN_NOTIFICATION_SENT": {
          "target": "waiting",
          "actions": ["updateRunRecord", "respondToHttpCaller"]
        }
      }
    }
  }
}
```
 
**Notes**:
- Validation lives in `realtime_engine` because it holds authoritative operational state (Redis)
- `notifying` handles both acceptance and rejection — context carries the outcome
- Cycles back to `waiting` after notification
 
**Actions reference**:
 
| Action | Service | Description |
|---|---|---|
| `validatePayload` | `backend` | Validate the HTTP request body — required fields: `vehicle_id`, `trip_id`, `route_id`, `start_time` |
| `createPendingRun` | `backend` | Create a `Run` record in PostgreSQL with status `pending` |
| `assignContext` | `backend` | Assign `run_id`, `vehicle_id`, `trip_id` to the machine context |
| `publishRunCommand` | `backend` | Publish the run command message to RabbitMQ |
| `checkVehicleAvailability` | `realtime_engine` | Check Redis `runs:in_progress` — is this vehicle already on an active run? |
| `checkTripAvailability` | `realtime_engine` | Check Redis — is this trip already assigned to another active run? |
| `validateSchedule` | `realtime_engine` | Validate against GTFS schedule: does the trip exist? Is the service active today per `calendar` + `calendar_dates`? |
| `setResultAccepted` | `realtime_engine` | Set `result: "accepted"` in context |
| `setResultRejected` | `realtime_engine` | Set `result: "rejected"` and `rejection_reason` in context |
| `emitRejectionObservation` | `realtime_engine` | Emit observation to RabbitMQ with rejection details |
| `addRunToActiveSet` | `realtime_engine` | Add `run_id` to the `runs:in_progress` set in Redis |
| `writeRunMetadata` | `realtime_engine` | Write `run:{id}` hash to Redis (vehicle_id, trip_id, route_id, start_time, status) |
| `writeVehicleMetadata` | `realtime_engine` | Write `vehicle:{id}:data` hash to Redis (initial metadata) |
| `emitInitializationObservation` | `realtime_engine` | Emit observation to RabbitMQ confirming run initialization |
| `updateRunRecord` | `backend` | Update `Run` record in PostgreSQL (status → `active` or `rejected`) |
| `respondToHttpCaller` | `backend` | Send HTTP response to the original API caller with the result |
 
---

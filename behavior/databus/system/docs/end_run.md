# 6. `end_run`
 
**Purpose**: Terminate an active run, whether triggered externally (dispatcher API call) or internally (realtime-engine decision).
 
**Actors**: `backend`, `realtime_engine`, `state` (Redis), `store` (PostgreSQL)
 
**States & transitions**:
 
```
waiting
  → END_RUN_REQUESTED → requesting
  → END_RUN_TRIGGERED → finalizing
 
requesting
  → END_RUN_COMMAND_SENT → finalizing
 
finalizing
  → RUN_FINALIZED → notifying
 
notifying
  → END_RUN_NOTIFICATION_SENT → waiting
```
 
**Events**:
 
| Event | Emitter | Meaning |
|---|---|---|
| `END_RUN_REQUESTED` | `backend` | API call received to end a run |
| `END_RUN_TRIGGERED` | `realtime_engine` | Engine autonomously decides to end the run (timeout, anomaly, trip complete) |
| `END_RUN_COMMAND_SENT` | `backend` | Command published to RabbitMQ for realtime-engine |
| `RUN_FINALIZED` | `realtime_engine` | Run keys flushed from Redis, traces written to PostgreSQL |
| `END_RUN_NOTIFICATION_SENT` | `backend` | System/caller notified of run termination |
 
**Context**: `run_id`, `vehicle_id`, `trigger` (`external` | `internal`), `reason` (optional)
 
**Actions per transition**:
 
| Transition | Actions |
|---|---|
| `waiting → requesting` | Validate HTTP request (run_id exists, run is active). Set trigger to external. Record run_id and vehicle_id in context. |
| `waiting → finalizing` | Set trigger to internal and reason in context (timeout, trip complete, anomaly). Record run_id and vehicle_id in context. |
| `requesting → finalizing` | Publish end run command to RabbitMQ. |
| `finalizing → notifying` | Remove run_id from `runs:in_progress` in Redis. Delete vehicle keys from Redis. Delete run hash from Redis. Write final trace data to PostgreSQL. Emit observation to RabbitMQ confirming finalization. |
| `notifying → waiting` | Update Run record in PostgreSQL (status → completed or terminated). Respond to HTTP caller if externally triggered. Broadcast run termination to consumers. |
 
**XState definition**:
 
```json
{
  "id": "end_run",
  "initial": "waiting",
  "context": {
    "run_id": null,
    "vehicle_id": null,
    "trigger": null,
    "reason": null
  },
  "states": {
    "waiting": {
      "on": {
        "backend.END_RUN_REQUESTED": {
          "target": "requesting",
          "actions": ["validateEndRunRequest", "setTriggerExternal", "assignContext"]
        },
        "realtime_engine.END_RUN_TRIGGERED": {
          "target": "finalizing",
          "actions": ["setTriggerInternal", "setReason", "assignContext"]
        }
      }
    },
    "requesting": {
      "on": {
        "backend.END_RUN_COMMAND_SENT": {
          "target": "finalizing",
          "actions": ["publishEndRunCommand"]
        }
      }
    },
    "finalizing": {
      "on": {
        "realtime_engine.RUN_FINALIZED": {
          "target": "notifying",
          "actions": ["removeRunFromActiveSet", "deleteVehicleKeys", "deleteRunHash", "writeTraceData", "emitFinalizationObservation"]
        }
      }
    },
    "notifying": {
      "on": {
        "backend.END_RUN_NOTIFICATION_SENT": {
          "target": "waiting",
          "actions": ["updateRunRecord", "respondToHttpCaller", "broadcastTermination"]
        }
      }
    }
  }
}
```
 
**Actions reference**:
 
| Action | Service | Description |
|---|---|---|
| `validateEndRunRequest` | `backend` | Validate the HTTP request — run_id exists and the run is currently active |
| `setTriggerExternal` | `backend` | Set `trigger: "external"` in context |
| `setTriggerInternal` | `realtime_engine` | Set `trigger: "internal"` in context |
| `setReason` | `realtime_engine` | Set `reason` in context (timeout, trip complete, anomaly detected) |
| `assignContext` | `backend` / `realtime_engine` | Record `run_id` and `vehicle_id` in context |
| `publishEndRunCommand` | `backend` | Publish end run command to RabbitMQ for realtime-engine |
| `removeRunFromActiveSet` | `realtime_engine` | Remove `run_id` from the `runs:in_progress` set in Redis |
| `deleteVehicleKeys` | `realtime_engine` | Delete `vehicle:{id}:position`, `vehicle:{id}:progression`, `vehicle:{id}:occupancy` from Redis |
| `deleteRunHash` | `realtime_engine` | Delete `run:{id}` hash from Redis |
| `writeTraceData` | `realtime_engine` | Write final trace data to PostgreSQL (FSM transitions, event timeline) |
| `emitFinalizationObservation` | `realtime_engine` | Emit observation to RabbitMQ confirming run finalization |
| `updateRunRecord` | `backend` | Update `Run` record in PostgreSQL (status → `completed` or `terminated`) |
| `respondToHttpCaller` | `backend` | Send HTTP response to the original API caller if externally triggered (no-op for internal triggers) |
| `broadcastTermination` | `backend` | Broadcast run termination event to interested consumers (Infobús, analytics) |
 
**Notes**:
- Two entry paths converge at `finalizing`: external goes through `requesting` first, internal skips straight to `finalizing`
- `finalizing` covers Redis cleanup and trace persistence — realtime-engine does both
- `notifying` handles both paths — context carries the trigger source
 
---

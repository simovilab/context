# 2. `ingest_telemetry`
 
**Purpose**: Receive raw vehicle telemetry from OBE devices, validate it, and accept it for downstream processing.
 
**Actors**: `telemetry_broker` (NanoMQ), `realtime_engine`
 
**States & transitions**:
 
```
waiting
  → TELEMETRY_RECEIVED → validating
 
validating
  → TELEMETRY_VALIDATED → processing
  → TELEMETRY_DISCARDED → waiting
 
processing
  → TELEMETRY_PROCESSED → waiting
```
 
**Events**:
 
| Event | Emitter | Meaning |
|---|---|---|
| `TELEMETRY_RECEIVED` | `telemetry_broker` | MQTT message forwarded to realtime-engine |
| `TELEMETRY_VALIDATED` | `realtime_engine` | Payload is well-formed, vehicle is on an active run, coordinates are plausible |
| `TELEMETRY_DISCARDED` | `realtime_engine` | Payload fails validation (unknown vehicle, no active run, bad data) |
| `TELEMETRY_PROCESSED` | `realtime_engine` | Datum accepted and ready for downstream consumption |
 
**Context**: `trip_id`, `route_id` (populated by `associateRunContext` after validation), `discard_reason` (optional)
 
**Actions per transition**:
 
| Transition | Actions |
|---|---|
| `waiting → validating` | Parse raw MQTT payload. Check vehicle is on an active run. Validate coordinates and timestamp. |
| `validating → processing` | Normalize payload. Associate datum with active run context. |
| `validating → waiting` | Set discard reason in context. Log discarded datum. |
| `processing → waiting` | Mark datum as ready for downstream consumption by `update_system_state`. |
 
**XState definition**:
 
```json
{
  "id": "ingest_telemetry",
  "initial": "waiting",
  "context": {
    "trip_id": null,
    "route_id": null,
    "discard_reason": null
  },
  "states": {
    "waiting": {
      "on": {
        "telemetry_broker.TELEMETRY_RECEIVED": {
          "target": "validating",
          "actions": ["parseMqttPayload", "checkActiveRun", "validateCoordinates", "validateTimestamp"]
        }
      }
    },
    "validating": {
      "on": {
        "realtime_engine.TELEMETRY_VALIDATED": {
          "target": "processing",
          "actions": ["normalizePayload", "associateRunContext"]
        },
        "realtime_engine.TELEMETRY_DISCARDED": {
          "target": "waiting",
          "actions": ["setDiscardReason", "logDiscardedDatum"]
        }
      }
    },
    "processing": {
      "on": {
        "realtime_engine.TELEMETRY_PROCESSED": {
          "target": "waiting",
          "actions": ["markReadyForStateUpdate"]
        }
      }
    }
  }
}
```
 
**Actions reference**:
 
| Action | Service | Description |
|---|---|---|
| `parseMqttPayload` | `realtime_engine` | Extract lat, lon, bearing, speed, timestamp, vehicle_id from raw MQTT message |
| `checkActiveRun` | `realtime_engine` | Look up vehicle_id in Redis `runs:in_progress` — is there an active run for this vehicle? |
| `validateCoordinates` | `realtime_engine` | Check coordinates are within expected geographic bounds (e.g., Costa Rica bounding box) |
| `validateTimestamp` | `realtime_engine` | Verify timestamp is not stale (>60s old) or in the future |
| `normalizePayload` | `realtime_engine` | Apply unit conversions, coordinate precision normalization |
| `associateRunContext` | `realtime_engine` | Enrich datum with active run context from Redis (trip_id, route_id) |
| `setDiscardReason` | `realtime_engine` | Set `discard_reason` in context (unknown vehicle, no active run, out of bounds, stale timestamp) |
| `logDiscardedDatum` | `realtime_engine` | Log the discarded datum for debugging and auditing |
| `markReadyForStateUpdate` | `realtime_engine` | Signal that the datum is ready for downstream consumption by `update_system_state` |
 
**Notes**:
- Raw telemetry is **untrusted signal** — validation is mandatory before any state changes
- This process is deliberately thin: it only covers getting data in the door
- Interpretation of the telemetry (FSM transitions, Redis writes) belongs to `update_system_state`
- Context carries run enrichment (`trip_id`, `route_id`) for downstream consumption by `update_system_state`, plus `discard_reason` for observability
 
---

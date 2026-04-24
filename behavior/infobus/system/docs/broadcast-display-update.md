# 5. `broadcast-display-update`

**Process**: `broadcast-display-update`
**Purpose**: Push computed display payloads to connected kiosks and SSE clients via Django Channels. Triggered by `update-display-state` when one or more screens materially changed. Tracks delivery, flags unreachable screens, and emits a distribution assertion.

**Actors**: `broker`, `orchestrator`, `memory`

**States & transitions**:

```
waiting
  → broker.BROADCAST_TRIGGERED → snapshotting

snapshotting
  → orchestrator.BROADCAST_SNAPSHOT_SUCCEEDED → dispatching
  → orchestrator.BROADCAST_SNAPSHOT_FAILED    → notifying

dispatching
  → orchestrator.BROADCAST_DISPATCH_SUCCEEDED → confirming
  → orchestrator.BROADCAST_DISPATCH_FAILED    → notifying

confirming
  → orchestrator.BROADCAST_CONFIRM_SUCCEEDED → waiting
  → orchestrator.BROADCAST_CONFIRM_FAILED    → notifying

notifying
  → orchestrator.BROADCAST_NOTIFICATION_SENT → waiting
```

**Events**:

| Event | Emitter | Meaning |
|---|---|---|
| `broker.BROADCAST_TRIGGERED` | `broker` | `update-display-state` requested a broadcast via the message bus |
| `orchestrator.BROADCAST_SNAPSHOT_SUCCEEDED` | `orchestrator` | Payloads read from `memory`; target channel groups resolved |
| `orchestrator.BROADCAST_SNAPSHOT_FAILED` | `orchestrator` | Redis read error, or no changed screens found |
| `orchestrator.BROADCAST_DISPATCH_SUCCEEDED` | `orchestrator` | Payloads serialized and sent to all target channel groups |
| `orchestrator.BROADCAST_DISPATCH_FAILED` | `orchestrator` | Channels layer failure |
| `orchestrator.BROADCAST_CONFIRM_SUCCEEDED` | `orchestrator` | Delivery tracking complete; unreachable screens marked |
| `orchestrator.BROADCAST_CONFIRM_FAILED` | `orchestrator` | Error during delivery tracking |
| `orchestrator.BROADCAST_NOTIFICATION_SENT` | `orchestrator` | Error path complete |

**Context**: `screen_ids` (string[]), `channel_groups` (string[]), `payload_size_bytes` (number), `delivered_count` (number), `unreachable_count` (number), `error` (string | null)

**Actions reference**:

| Action | Service | Description |
|---|---|---|
| `orchestrator.read_display_payloads` | `orchestrator` | Read the per-screen display state from `memory` for all changed screens |
| `orchestrator.resolve_target_channel_groups` | `orchestrator` | Map each changed screen to its Django Channels group name |
| `orchestrator.serialize_payloads` | `orchestrator` | Serialize payloads for WebSocket and SSE delivery |
| `orchestrator.send_to_channel_groups` | `orchestrator` | `channel_layer.group_send(...)` to each target group |
| `orchestrator.track_delivery` | `orchestrator` | Count acknowledged deliveries per group |
| `orchestrator.mark_unreachable_screens` | `orchestrator` | Flag screens whose groups had no live consumers as unreachable in `memory` |
| `orchestrator.emit_broadcast_assertion` | `orchestrator` | Publish assertion on `broker` summarizing distribution outcome |
| `orchestrator.send_notifications` | `orchestrator` | Dispatch error notification |
| `orchestrator.log_errors` | `orchestrator` | Write structured error details to the application log |
| `orchestrator.flush_data` | `orchestrator` | Discard in-flight payload buffers on failure |

**Responsibilities per state**:

| State | Owner | What happens here |
|---|---|---|
| `waiting` | `orchestrator` | Idle; machine waits for a broadcast trigger via `broker` |
| `snapshotting` | `orchestrator` | Reads payloads from `memory` and resolves target Channels groups |
| `dispatching` | `orchestrator` | Serializes and sends payloads to each target Channels group |
| `confirming` | `orchestrator` | Tracks deliveries, flags unreachable screens, and emits the distribution assertion |
| `notifying` | `orchestrator` | Logs and notifies on any failure |

**Notes**:
- This is the push side of the live pipeline — independent of individual WS connections (those are owned by `manage-screen-connection`)
- A screen reconnecting later receives the current state from `memory`, not a missed broadcast — this process does not guarantee exactly-once delivery across reconnects
- Material-change gating happens upstream in `update-display-state`; this process assumes work is warranted whenever it is triggered
- Analogous to the `publishing` phase of databus's `build-gtfs-realtime`, but for screen payloads instead of GTFS-RT protobuf
- The `infobus.` namespace prefix is omitted throughout for readability

---

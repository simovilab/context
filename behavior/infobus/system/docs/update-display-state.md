# 4. `update-display-state`

**Process**: `update-display-state`
**Purpose**: Read the enriched snapshot from `memory`, evaluate per-screen relevance via PostGIS spatial filter and route subscription rules, compute display payloads for each active screen, and write them back to `memory`. On material change, request a broadcast.

**Actors**: `engine`, `memory`, `broker`

**States & transitions**:

```
waiting
  → engine.DISPLAY_UPDATE_REQUESTED → fetching

fetching
  → engine.DISPLAY_FETCH_SUCCEEDED → evaluating
  → engine.DISPLAY_FETCH_FAILED    → notifying

evaluating
  → engine.DISPLAY_STATE_EVALUATED → updating

updating
  → engine.DISPLAY_UPDATE_SUCCEEDED → waiting
  → engine.DISPLAY_UPDATE_FAILED    → notifying

notifying
  → engine.DISPLAY_NOTIFICATION_SENT → waiting
```

**Events**:

| Event | Emitter | Meaning |
|---|---|---|
| `engine.DISPLAY_UPDATE_REQUESTED` | `engine` | A fresh snapshot is available; re-evaluate all active screens |
| `engine.DISPLAY_FETCH_SUCCEEDED` | `engine` | Enriched snapshot and active screen list loaded from `memory` |
| `engine.DISPLAY_FETCH_FAILED` | `engine` | Snapshot missing, stale, or screen list unreadable |
| `engine.DISPLAY_STATE_EVALUATED` | `engine` | Per-screen payloads computed; changes recorded |
| `engine.DISPLAY_UPDATE_SUCCEEDED` | `engine` | Display state written to `memory` |
| `engine.DISPLAY_UPDATE_FAILED` | `engine` | Redis write error |
| `engine.DISPLAY_NOTIFICATION_SENT` | `engine` | Error path complete |

**Context**: `snapshot_timestamp` (number | null), `screens_evaluated` (number), `screens_changed` (number), `changes` (string[]), `observation_required` (boolean), `error` (string | null)

**Actions reference**:

| Action | Service | Description |
|---|---|---|
| `engine.load_enriched_snapshot` | `engine` | Read the GTFS + enrichment snapshot from `memory` |
| `engine.load_active_screens` | `engine` | Load all active screen records (location `Point`, route subscriptions, display config) |
| `engine.apply_spatial_filter` | `engine` | Filter vehicles/stops/alerts by proximity to each screen's PostGIS `Point` |
| `engine.apply_route_subscriptions` | `engine` | Filter relevant routes/trips based on each screen's subscription list |
| `engine.compute_display_payloads` | `engine` | Build the final rendered payload per screen (ETAs, alerts, weather panel, social panel) |
| `engine.detect_material_changes` | `engine` | Compare each screen's new payload to its previous state to flag material change |
| `engine.record_changes` | `engine` | Populate the `changes` context field for downstream observation |
| `engine.write_screen_display_state` | `engine` | Write each screen's new payload to its `screen:{id}:display_state` key in `memory` |
| `engine.update_last_refresh_timestamp` | `engine` | Update per-screen last-refresh timestamp in `memory` |
| `engine.publish_display_change_observation` | `engine` | Publish observation on `broker` summarizing screens changed |
| `engine.request_broadcast` | `engine` | Emit `broker.BROADCAST_TRIGGERED` to wake `broadcast-display-update` |
| `engine.send_notifications` | `engine` | Dispatch error notification |
| `engine.log_errors` | `engine` | Write structured error details to the application log |

**Responsibilities per state**:

| State | Owner | What happens here |
|---|---|---|
| `waiting` | `engine` | Idle; machine waits for a display update request from `poll-gtfs-feed` or `enrich-context-data` |
| `fetching` | `engine` | Loads the enriched snapshot and the list of active screens |
| `evaluating` | `engine` | Applies spatial and subscription filters, computes per-screen payloads, detects material changes |
| `updating` | `engine` | Writes per-screen payloads back to `memory` and triggers broadcast on success |
| `notifying` | `engine` | Logs and notifies on fetch or write failure |

**Notes**:
- This is the projection step — converts "data about the network" into "what appears on screen N"
- Screen-relevance logic is centralized here so WebSocket consumers do not re-derive it per connection
- `request_broadcast` fires only when at least one screen materially changed; unchanged ticks do not wake `broadcast-display-update`
- Analogous to `update-system-state` in databus, but projects to screens rather than vehicle Redis keys
- The `infobus.` namespace prefix is omitted throughout for readability

---

# 2. `poll-gtfs-feed`

**Process**: `poll-gtfs-feed`
**Purpose**: High-cadence polling of GTFS Realtime feeds. For each configured provider, fetch the protobuf feed, parse it into Python DataClasses via `gtfs-io`, and write both the structured snapshot and the raw blob to `memory` (Redis). Redis is the sole handoff point to downstream consumers (`update-display-state`, `broadcast-display-update`).

**Actors**: `scheduler`, `engine`, `memory`, `broker`

**States & transitions**:

```
waiting
  → scheduler.FEED_POLL_TRIGGERED → fetching

fetching
  → engine.FEED_FETCH_SUCCEEDED → parsing
  → engine.FEED_FETCH_FAILED    → notifying

parsing
  → engine.FEED_PARSE_SUCCEEDED → caching
  → engine.FEED_PARSE_FAILED    → notifying

caching
  → engine.FEED_CACHE_SUCCEEDED → waiting
  → engine.FEED_CACHE_FAILED    → notifying

notifying
  → engine.FEED_POLL_NOTIFICATION_SENT → waiting
```

**Events**:

| Event | Emitter | Meaning |
|---|---|---|
| `scheduler.FEED_POLL_TRIGGERED` | `scheduler` | High-cadence Celery Beat tick (~15s) requesting a feed poll |
| `engine.FEED_FETCH_SUCCEEDED` | `engine` | Protobuf bytes retrieved from provider URL |
| `engine.FEED_FETCH_FAILED` | `engine` | HTTP error, timeout, or non-2xx response |
| `engine.FEED_PARSE_SUCCEEDED` | `engine` | `gtfs-io` produced valid DataClass objects |
| `engine.FEED_PARSE_FAILED` | `engine` | Malformed protobuf or entities failing validation |
| `engine.FEED_CACHE_SUCCEEDED` | `engine` | Snapshot and raw blob written to `memory` |
| `engine.FEED_CACHE_FAILED` | `engine` | Redis write error |
| `engine.FEED_POLL_NOTIFICATION_SENT` | `engine` | Error path complete; provider flagged as degraded |

**Context**: `transit_system_id` (string | null), `gtfs_provider_id` (string | null), `feed_url` (string | null), `snapshot_timestamp` (number | null), `entities_count` (number), `provider_degraded` (boolean), `error` (string | null)

**Actions reference**:

| Action | Service | Description |
|---|---|---|
| `engine.resolve_provider_url` | `engine` | Load the provider row from `database` and resolve its Realtime feed URL |
| `engine.fetch_feed_url` | `engine` | HTTP GET the protobuf feed with appropriate timeouts and headers |
| `engine.parse_protobuf_to_dataclass` | `engine` | Use `gtfs-io` to parse the raw protobuf into Python DataClass objects |
| `engine.validate_feed_entities` | `engine` | Sanity-check entities (required fields populated, timestamps reasonable) |
| `engine.count_entities` | `engine` | Record entity counts for `vehicle_positions`, `trip_updates`, `alerts` |
| `engine.write_feed_snapshot_to_memory` | `engine` | Write parsed DataClass snapshot to Redis under the provider's snapshot key |
| `engine.write_raw_blob_to_memory` | `engine` | Write raw protobuf bytes to Redis as secondary storage for replay/debug |
| `engine.clear_provider_degraded_flag` | `engine` | Clear the degraded flag if previously set — provider is healthy again |
| `engine.emit_poll_observation` | `engine` | Publish observation on `broker` confirming a fresh snapshot is available |
| `engine.request_display_state_update` | `engine` | Trigger `update-display-state` to re-compute per-screen payloads |
| `engine.serve_stale_snapshot` | `engine` | Leave the last-good snapshot in `memory` untouched so consumers keep reading |
| `engine.flag_provider_degraded` | `engine` | Set a degraded flag in `memory` so API/WS surfaces can annotate staleness |
| `engine.send_notifications` | `engine` | Dispatch error notification (alert, dead-letter queue) |
| `engine.log_errors` | `engine` | Write structured error details to the application log |

**Responsibilities per state**:

| State | Owner | What happens here |
|---|---|---|
| `waiting` | `engine` | Idle; machine waits for the high-cadence scheduler tick |
| `fetching` | `engine` | Resolves the provider URL and retrieves the protobuf feed |
| `parsing` | `engine` | Converts the protobuf into validated DataClass entities via `gtfs-io` |
| `caching` | `engine` | Writes the structured snapshot and raw blob to `memory` |
| `notifying` | `engine` | Keeps the last-good snapshot in place, flags the provider as degraded, and logs the error |

**Notes**:
- Runs per (`TransitSystem`, `GTFSProvider`) pair — infobus is multi-agency by design
- `memory` (Redis) is the authoritative handoff point; the DataClass in-process objects are ephemeral
- On failure, the previous snapshot is retained — consumers never get an empty read
- No DB writes on the hot path — persistence is handled by `save-feed-snapshot`
- `emit_poll_observation` and `request_display_state_update` are transition actions that chain the pipeline forward
- The `infobus.` namespace prefix is omitted throughout for readability

---

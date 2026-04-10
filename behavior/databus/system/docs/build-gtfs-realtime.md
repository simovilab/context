# 4. `build-gtfs-realtime`

**Process**: `build-gtfs-realtime`
**Purpose**: Build GTFS-RT VehiclePositions and TripUpdates protobuf feeds from a point-in-time Redis snapshot, then publish them to stable file paths and notify downstream consumers.

**Actors**: `scheduler` (Celery Beat), `tasks` (Celery worker), `state` (Redis), `store` (PostgreSQL), `message_broker` (RabbitMQ)

**States & transitions**:

```
waiting
  → scheduler.BUILD_TRIGGERED → snapshotting

snapshotting
  → tasks.SNAPSHOT_SUCCEEDED → building
  → tasks.SNAPSHOT_FAILED    → notifying

building
  → tasks.BUILD_SUCCEEDED → publishing
  → tasks.BUILD_FAILED    → notifying

publishing
  → tasks.PUBLISH_SUCCEEDED → waiting
  → tasks.PUBLISH_FAILED    → notifying

notifying
  → tasks.BUILD_NOTIFICATION_SENT → waiting
```

**Events**:

| Event | Emitter | Meaning |
|---|---|---|
| `scheduler.BUILD_TRIGGERED` | `scheduler` | Celery Beat fires the periodic build task (every 15 s) |
| `tasks.SNAPSHOT_SUCCEEDED` | `tasks` | Redis snapshot read successfully; all active run data is in memory |
| `tasks.SNAPSHOT_FAILED` | `tasks` | Redis read failed; process enters error notification path |
| `tasks.BUILD_SUCCEEDED` | `tasks` | VP and TU protobuf feeds constructed successfully |
| `tasks.BUILD_FAILED` | `tasks` | Feed construction failed; process enters error notification path |
| `tasks.PUBLISH_SUCCEEDED` | `tasks` | Feed files written to disk and assertion emitted to RabbitMQ |
| `tasks.PUBLISH_FAILED` | `tasks` | Feed file write or assertion failed; process enters error notification path |
| `tasks.BUILD_NOTIFICATION_SENT` | `tasks` | Error notification dispatched; process returns to waiting |

**Context**: `snapshot_timestamp` (timestamp\|null), `active_runs` (int), `entities_vp` (int), `entities_tu` (int)

**Actions reference**:

| Action | Service | Description |
|---|---|---|
| `tasks.record_trigger_timestamp` | `tasks` | Store the scheduler trigger time in context as `snapshot_timestamp` |
| `tasks.read_active_runs` | `tasks` | Read the `runs:in_progress` set from Redis to get all active run IDs; store count in `active_runs` |
| `tasks.read_vehicle_states` | `tasks` | For each active run, read `vehicle:{id}:position`, `vehicle:{id}:progression`, `vehicle:{id}:occupancy` from Redis |
| `tasks.read_stop_time_updates` | `tasks` | Read pending stop-time update records from Redis for each active run (used later by TU builder) |
| `tasks.poll_gtfs_schedule` | `tasks` | Query PostgreSQL for GTFS Schedule data needed by the TU builder: `stop_times`, trip metadata, calendar |
| `tasks.build_vehicle_positions_feed` | `tasks` | Construct VehiclePositions FeedMessage protobuf — one entity per active vehicle with position, trip, and vehicle status; store `entities_vp` count in context |
| `tasks.build_trip_updates_feed` | `tasks` | Construct TripUpdates FeedMessage protobuf — one entity per active trip with `stop_time_update` entries (delay, uncertainty); store `entities_tu` count in context |
| `tasks.set_feed_headers` | `tasks` | Set FeedHeader fields: `gtfs_realtime_version: "2.0"`, `incrementality: FULL_DATASET`, `timestamp` |
| `tasks.write_feed_files` | `tasks` | Write `vehicle_positions.pb` and `trip_updates.pb` to `backend/feed/files/` |
| `tasks.emit_publication_assertion` | `tasks` | Publish assertion to RabbitMQ confirming feed generation (timestamp, entity counts) |
| `tasks.send_notifications` | `tasks` | Dispatch error notifications (e.g. alert channel, ops dashboard) when the build cycle fails at any step |
| `tasks.log_errors` | `tasks` | Write structured error details to the application log and/or store for post-mortem |
| `tasks.flush_data` | `tasks` | Clear any partial in-memory state accumulated during the failed cycle before returning to `waiting` |

**Responsibilities per state**:

| State | Owner | What happens here |
|---|---|---|
| `waiting` | `scheduler` | Machine is idle; waits for the next periodic trigger from Celery Beat |
| `snapshotting` | `tasks` | Records trigger timestamp; reads active run IDs, vehicle states, and stop-time updates from Redis into memory |
| `building` | `tasks` | Polls GTFS Schedule from PostgreSQL; constructs VP and TU protobuf feeds; sets feed headers |
| `publishing` | `tasks` | Writes feed files to disk; on success emits publication assertion to RabbitMQ |
| `notifying` | `tasks` | On any failure path: sends notifications, logs errors, flushes partial state, then returns to waiting |

**Notes**:
- Triggered every 15 seconds by the scheduler
- VP and TU feeds are built together in a single `building` step
- `publishing` covers both writing feed files and emitting an assertion to RabbitMQ
- Snapshot is a point-in-time read — no writes to Redis during `snapshotting`
- All three failure events (`SNAPSHOT_FAILED`, `BUILD_FAILED`, `PUBLISH_FAILED`) funnel into `notifying`, which always returns to `waiting`
- The `databus.` namespace prefix is omitted throughout for readability; it can be prepended to all identifiers per the project README naming conventions

**Key changes from previous spec**:
1. Machine `id` renamed from `build_gtfs_realtime` to `build-gtfs-realtime` (kebab-case convention)
2. Added `notifying` state as a shared error-handling path for all failure scenarios
3. Added failure events: `tasks.SNAPSHOT_FAILED`, `tasks.BUILD_FAILED`, `tasks.PUBLISH_FAILED` (all target `notifying`)
4. Added `tasks.BUILD_NOTIFICATION_SENT` event to exit `notifying` back to `waiting`
5. Success events renamed: `SNAPSHOT_ACQUIRED` → `SNAPSHOT_SUCCEEDED`, `FEED_BUILT` → `BUILD_SUCCEEDED`, `FEED_PUBLISHED` → `PUBLISH_SUCCEEDED`
6. Actions moved from transition `actions` arrays to state `entry` arrays (topology change)
7. All action names fully qualified with `tasks.` prefix and converted to snake_case
8. New action `tasks.read_stop_time_updates` added to `snapshotting` entry
9. New actions `tasks.send_notifications`, `tasks.log_errors`, `tasks.flush_data` added in `notifying` entry
10. `recordActiveRunCount` and `recordEntityCounts` removed as standalone actions; count recording is now implicit in `read_active_runs` and `build_vehicle_positions_feed` / `build_trip_updates_feed` respectively

---

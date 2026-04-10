# 5. `save-gtfs-feed-messages`

**Process**: `save-gtfs-feed-messages`
**Purpose**: Serialize and persist published GTFS-RT feed messages to Parquet format for historical retention and batch analytics.

**Actors**: `tasks` (Celery worker), `store` (PostgreSQL)

**States & transitions**:

```
waiting
  → tasks.SAVE_TRIGGERED → serializing

serializing
  → tasks.SERIALIZATION_SUCCEEDED → persisting
  → tasks.SERIALIZATION_FAILED    → notifying

persisting
  → tasks.PERSIST_SUCCEEDED → waiting
  → tasks.PERSIST_FAILED    → notifying

notifying
  → tasks.SAVE_NOTIFICATION_SENT → waiting
```

**Events**:

| Event | Emitter | Meaning |
|---|---|---|
| `tasks.SAVE_TRIGGERED` | `tasks` | Feed published by `build-gtfs-realtime`; ready for persistence |
| `tasks.SERIALIZATION_SUCCEEDED` | `tasks` | Feed data converted to Parquet and metadata enriched successfully |
| `tasks.SERIALIZATION_FAILED` | `tasks` | Serialization failed; process enters error notification path |
| `tasks.PERSIST_SUCCEEDED` | `tasks` | Parquet file written to storage; assertion emitted |
| `tasks.PERSIST_FAILED` | `tasks` | Persistence write failed; process enters error notification path |
| `tasks.SAVE_NOTIFICATION_SENT` | `tasks` | Error notification dispatched; process returns to waiting |

**Context**: `snapshot_timestamp` (timestamp\|null), `feed_type` (`vp`\|`tu`\|null), `blob_size_bytes` (int), `storage_format` (`parquet`\|`postgres`\|`both`\|null)

**Actions reference**:

| Action | Service | Description |
|---|---|---|
| `tasks.receive_feed_data` | `tasks` | Receive the built protobuf feed data from `build-gtfs-realtime`; store feed type and snapshot timestamp in context |
| `tasks.convert_to_parquet` | `tasks` | Extract protobuf entities into columnar Parquet format for efficient batch analytics |
| `tasks.enrich_metadata` | `tasks` | Attach metadata to the record: snapshot timestamp, entity counts, feed version, generation duration |
| `tasks.calculate_blob_size` | `tasks` | Compute the size in bytes of the serialized feed; store in `blob_size_bytes` context field |
| `tasks.persist_parquet_file` | `tasks` | Write the Parquet file (and any associated blob) to storage; record `storage_format` in context |
| `tasks.emit_persistence_assertion` | `tasks` | Publish assertion to RabbitMQ confirming the feed record has been persisted (timestamp, feed type, blob size) |
| `tasks.clear_feed_data` | `tasks` | Release in-memory feed data after successful persistence to free resources |
| `tasks.send_notifications` | `tasks` | Dispatch error notifications (e.g. alert channel, ops dashboard) when the save cycle fails at any step |
| `tasks.log_errors` | `tasks` | Write structured error details to the application log and/or store for post-mortem |
| `tasks.flush_data` | `tasks` | Clear any partial in-memory state accumulated during the failed cycle before returning to `waiting` |

**Responsibilities per state**:

| State | Owner | What happens here |
|---|---|---|
| `waiting` | `tasks` | Machine is idle; waits for a feed publication event from the build process |
| `serializing` | `tasks` | Receives feed data; converts to Parquet; enriches with metadata; calculates blob size |
| `persisting` | `tasks` | Writes the Parquet file to storage; on success emits persistence assertion and clears in-memory data |
| `notifying` | `tasks` | On any failure path: sends notifications, logs errors, flushes partial state, then returns to waiting |

**Notes**:
- Follows directly after `build-gtfs-realtime` completes (triggered by feed publication event)
- Records are retained for ~1 year for analytics and auditing
- Parquet format supports batch processing by the `analytics-engine`
- Both failure paths (`SERIALIZATION_FAILED`, `PERSIST_FAILED`) funnel into `notifying`, which always returns to `waiting`
- The `databus.` namespace prefix is omitted throughout for readability; it can be prepended to all identifiers per the project README naming conventions

**Key changes from previous spec**:
1. Machine `id` renamed from `save_gtfs_feed_messages` to `save-gtfs-feed-messages` (kebab-case convention)
2. Added `notifying` state as a shared error-handling path for all failure scenarios
3. Added failure events: `tasks.SERIALIZATION_FAILED`, `tasks.PERSIST_FAILED` (both target `notifying`)
4. Added `tasks.SAVE_NOTIFICATION_SENT` event to exit `notifying` back to `waiting`
5. Success events renamed: `FEED_SERIALIZED` → `SERIALIZATION_SUCCEEDED`, `FEED_PERSISTED` → `PERSIST_SUCCEEDED`
6. `writeFeedToPostgres` + `writeParquetFile` replaced by single `tasks.persist_parquet_file` action (unified persistence step)
7. New actions: `tasks.emit_persistence_assertion`, `tasks.clear_feed_data`, `tasks.send_notifications`, `tasks.log_errors`, `tasks.flush_data`
8. Removed actions: `recordFeedType`, `recordSnapshotTimestamp`, `recordStorageInfo` — context fields still tracked; recording is now folded into `receive_feed_data` and `persist_parquet_file`
9. Actions moved from transition `actions` arrays to state `entry` arrays (topology change)
10. All action names fully qualified with `tasks.` prefix and converted to snake_case

---

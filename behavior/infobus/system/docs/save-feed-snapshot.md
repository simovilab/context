# 3. `save-feed-snapshot`

**Process**: `save-feed-snapshot`
**Purpose**: Periodically serialize the current GTFS-RT snapshot from `memory` to Parquet and persist it to `database` (or the data lake). Produces the historical record used for replay, analytics, and audit.

**Actors**: `scheduler`, `engine`, `memory`, `database`

**States & transitions**:

```
waiting
  → scheduler.SNAPSHOT_SAVE_TRIGGERED → serializing

serializing
  → engine.SNAPSHOT_SERIALIZATION_SUCCEEDED → persisting
  → engine.SNAPSHOT_SERIALIZATION_FAILED    → notifying

persisting
  → engine.SNAPSHOT_PERSIST_SUCCEEDED → waiting
  → engine.SNAPSHOT_PERSIST_FAILED    → notifying

notifying
  → engine.SNAPSHOT_NOTIFICATION_SENT → waiting
```

**Events**:

| Event | Emitter | Meaning |
|---|---|---|
| `scheduler.SNAPSHOT_SAVE_TRIGGERED` | `scheduler` | Celery Beat tick requesting a snapshot save |
| `engine.SNAPSHOT_SERIALIZATION_SUCCEEDED` | `engine` | Snapshot converted to Parquet with metadata |
| `engine.SNAPSHOT_SERIALIZATION_FAILED` | `engine` | Serialization error (bad schema, empty snapshot, encoding issue) |
| `engine.SNAPSHOT_PERSIST_SUCCEEDED` | `engine` | Parquet blob written to `database` |
| `engine.SNAPSHOT_PERSIST_FAILED` | `engine` | DB write error |
| `engine.SNAPSHOT_NOTIFICATION_SENT` | `engine` | Error path complete |

**Context**: `snapshot_timestamp` (number | null), `entity_count` (number), `storage_format` (string | null), `blob_size_bytes` (number), `error` (string | null)

**Actions reference**:

| Action | Service | Description |
|---|---|---|
| `engine.read_feed_snapshot` | `engine` | Read current parsed GTFS-RT snapshot from `memory` for all active providers |
| `engine.convert_to_parquet` | `engine` | Serialize the snapshot DataClasses to Parquet format |
| `engine.enrich_metadata` | `engine` | Attach snapshot metadata (provider IDs, timestamp, entity counts, schema version) |
| `engine.calculate_blob_size` | `engine` | Measure serialized blob size for metrics |
| `engine.persist_parquet_file` | `engine` | Write Parquet blob + metadata row to `database` |
| `engine.emit_persistence_assertion` | `engine` | Publish assertion on `broker` confirming snapshot persisted |
| `engine.clear_feed_data` | `engine` | Release in-process buffers after successful persist |
| `engine.flush_data` | `engine` | Discard partial in-process buffers on failure |
| `engine.send_notifications` | `engine` | Dispatch error notification |
| `engine.log_errors` | `engine` | Write structured error details to the application log |

**Responsibilities per state**:

| State | Owner | What happens here |
|---|---|---|
| `waiting` | `engine` | Idle; machine waits for the scheduler tick |
| `serializing` | `engine` | Converts the in-memory snapshot into a Parquet blob with enriched metadata |
| `persisting` | `engine` | Writes the Parquet blob to `database` |
| `notifying` | `engine` | Flushes buffers and logs the error on any failure |

**Notes**:
- Independent failure domain from `poll-gtfs-feed` — a DB outage must not stall polling
- Snapshot persistence is purely historical; the live path never reads from `database` for Realtime data
- Retention policy lives in `database` (e.g., 1-year rolling window)
- The `infobus.` namespace prefix is omitted throughout for readability

---

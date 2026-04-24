# 1. `poll-gtfs-schedule`

**Process**: `poll-gtfs-schedule`
**Purpose**: Detect GTFS Schedule changes at each configured provider, download the new zip, validate referential integrity, stage it, and atomically promote it into the live schema in `database`. On promotion, emit an assertion that downstream projections (knowledge graph) use as a trigger.

**Actors**: `scheduler`, `engine`, `database`

**States & transitions**:

```
waiting
  → scheduler.SCHEDULE_POLL_TRIGGERED → checking

checking
  → engine.SCHEDULE_CHANGE_DETECTED → downloading
  → engine.SCHEDULE_UNCHANGED       → waiting
  → engine.SCHEDULE_CHECK_FAILED    → notifying

downloading
  → engine.SCHEDULE_DOWNLOAD_SUCCEEDED → validating
  → engine.SCHEDULE_DOWNLOAD_FAILED    → notifying

validating
  → engine.SCHEDULE_VALIDATION_SUCCEEDED → staging
  → engine.SCHEDULE_VALIDATION_FAILED    → notifying

staging
  → engine.SCHEDULE_STAGING_SUCCEEDED → promoting
  → engine.SCHEDULE_STAGING_FAILED    → notifying

promoting
  → engine.SCHEDULE_PROMOTION_SUCCEEDED → waiting
  → engine.SCHEDULE_PROMOTION_FAILED    → notifying

notifying
  → engine.SCHEDULE_NOTIFICATION_SENT → waiting
```

**Events**:

| Event | Emitter | Meaning |
|---|---|---|
| `scheduler.SCHEDULE_POLL_TRIGGERED` | `scheduler` | Low-cadence Celery Beat tick requesting a Schedule poll |
| `engine.SCHEDULE_CHANGE_DETECTED` | `engine` | Remote feed version differs from loaded version |
| `engine.SCHEDULE_UNCHANGED` | `engine` | Remote feed version matches loaded version — no action |
| `engine.SCHEDULE_CHECK_FAILED` | `engine` | Could not read local version or fetch remote feed_info |
| `engine.SCHEDULE_DOWNLOAD_SUCCEEDED` | `engine` | Zip retrieved and saved to temporary storage |
| `engine.SCHEDULE_DOWNLOAD_FAILED` | `engine` | Download error, corrupt archive, or missing required files |
| `engine.SCHEDULE_VALIDATION_SUCCEEDED` | `engine` | Feed structure valid and referential integrity intact |
| `engine.SCHEDULE_VALIDATION_FAILED` | `engine` | Required file missing, column mismatch, or broken references |
| `engine.SCHEDULE_STAGING_SUCCEEDED` | `engine` | Feed loaded into staging tables via `gtfs-django` |
| `engine.SCHEDULE_STAGING_FAILED` | `engine` | Staging load error (DB write, type coercion, constraint) |
| `engine.SCHEDULE_PROMOTION_SUCCEEDED` | `engine` | Staging swapped to live atomically |
| `engine.SCHEDULE_PROMOTION_FAILED` | `engine` | Swap error — live data unchanged |
| `engine.SCHEDULE_NOTIFICATION_SENT` | `engine` | Error path complete, staging rolled back |

**Context**: `transit_system_id` (string | null), `gtfs_provider_id` (string | null), `feed_url` (string | null), `current_feed_version` (string | null), `remote_feed_version` (string | null), `changes_detected` (boolean), `error` (string | null)

**Actions reference**:

| Action | Service | Description |
|---|---|---|
| `engine.read_current_feed_version` | `engine` | Read loaded feed version from `database` (from `feed_info.txt` or equivalent metadata row) |
| `engine.fetch_remote_feed_info` | `engine` | HTTP HEAD/GET against provider URL to read remote version metadata |
| `engine.compare_feed_versions` | `engine` | Compare local vs. remote version strings to decide whether to proceed |
| `engine.download_feed_zip` | `engine` | Download GTFS Schedule zip to a temp location |
| `engine.validate_feed_structure` | `engine` | Verify all required GTFS files are present and columns match the spec |
| `engine.validate_referential_integrity` | `engine` | Ensure trip_ids, stop_ids, route_ids, service_ids all resolve across files |
| `engine.load_to_staging_tables` | `engine` | Load feed contents into staging tables via `gtfs-django` loader |
| `engine.swap_staging_to_live` | `engine` | Atomically promote staging data to live schema |
| `engine.emit_schedule_promotion_assertion` | `engine` | Publish assertion on `broker` that a new schedule version is live (consumed by `sync-knowledge-graph`) |
| `engine.rollback_staging` | `engine` | Drop or truncate staging tables after a failure |
| `engine.send_notifications` | `engine` | Dispatch error notification to operators |
| `engine.log_errors` | `engine` | Write structured error details to the application log |

**Responsibilities per state**:

| State | Owner | What happens here |
|---|---|---|
| `waiting` | `engine` | Idle; machine waits for the low-cadence scheduler tick |
| `checking` | `engine` | Compares local and remote feed versions; decides whether work is needed |
| `downloading` | `engine` | Retrieves the GTFS zip from the provider URL |
| `validating` | `engine` | Checks feed structure and referential integrity before touching the DB |
| `staging` | `engine` | Loads the new feed into staging tables, leaving live data intact |
| `promoting` | `engine` | Atomically swaps staging to live and emits the promotion assertion |
| `notifying` | `engine` | Rolls back staging, sends notifications, and logs errors on any failure |

**Notes**:
- Runs on a low cadence (daily or on a webhook) — distinct from the high-cadence `poll-gtfs-feed`
- Promotion must be atomic; partial loads corrupt downstream projections
- Assertion on `SCHEDULE_PROMOTION_SUCCEEDED` is the sole trigger for `sync-knowledge-graph`
- Per-provider execution: one instance per (`TransitSystem`, `GTFSProvider`) pair
- The `infobus.` namespace prefix is omitted throughout for readability

---

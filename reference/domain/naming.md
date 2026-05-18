# Naming Conventions

Naming conventions for all identifiers in the Databús and Infobús state machine ecosystem. These rules are applied when writing or refactoring FSM JSON/YAML and process reference specs. See [`behavior/databus/system/README.md`](../../behavior/databus/system/README.md) for the canonical source of the Databús naming table.

## Convention Table

| Layer | Case | Pattern | Example |
|---|---|---|---|
| Services (actors) | `snake_case` | `<service>` | `realtime_engine`, `telemetry_broker` |
| Processes (machines) | `kebab-case` | `<process>` | `register-run`, `poll-gtfs-feed` |
| States | `snake_case` (usually one word) | `<state>` | `waiting`, `in_progress`, `no_signal` |
| Events | `SCREAMING_SNAKE_CASE` | `<service>.<EVENT>` | `backend.RUN_SUBMISSION_REQUESTED`, `scheduler.BUILD_TRIGGERED` |
| Actions (functions) | `snake_case` | `<service>.<action>` | `realtime_engine.write_run_metadata`, `engine.load_enriched_snapshot` |
| Messages (AMQP/camelCase) | `camelCase` | `<messageName>` | `runSubmissionRequest`, `feedPollObservation` |

## Namespace Rules

Everything in Databús is logically namespaced under `databus.`, and everything in Infobús under `infobus.`. However, **the `databus.` and `infobus.` prefixes are omitted by default** within their own system's FSM files and process docs to reduce verbosity. Use the full prefix only when referencing identifiers cross-system or in contexts where disambiguation is required.

Full qualified examples (shown here for clarity; omit prefix inside system-specific files):
- `databus.register-run` — the register-run machine in Databús
- `databus.backend.RUN_SUBMISSION_REQUESTED` — an event emitted by the backend service in Databús
- `databus.realtime_engine.write_run_metadata` — an action performed by realtime_engine in Databús
- `infobus.engine.FEED_FETCH_SUCCEEDED` — an event emitted by the engine in Infobús

## Concrete Examples

### Databús process: `register-run`

```
Machine id:    register-run           (kebab-case)
Initial state: waiting                (snake_case)
Event:         backend.RUN_SUBMISSION_REQUESTED    (service.SCREAMING_SNAKE_CASE)
Action:        realtime_engine.write_run_metadata  (service.snake_case)
```

### Databús process: `run-lifecycle`

```
Machine id:    run-lifecycle          (kebab-case)
State:         in_progress            (snake_case, multi-word joined with _)
Event:         realtime_engine.RUN_TRACKING_LOST   (service.SCREAMING_SNAKE_CASE)
Guard:         backend.is_telemetry_stale          (service.snake_case)
Action:        backend.remove_from_tracking_set    (service.snake_case)
```

### Infobús process: `poll-gtfs-feed`

```
Machine id:    poll-gtfs-feed         (kebab-case)
State:         caching                (snake_case)
Event:         scheduler.FEED_POLL_TRIGGERED       (service.SCREAMING_SNAKE_CASE)
Action:        engine.write_feed_snapshot_to_memory (service.snake_case)
```

## File Naming

- JSON FSM files: `kebab-case.json` (e.g., `register-run.json`, `poll-gtfs-feed.json`)
- YAML DSL files: `snake_case.yaml` (e.g., `register_run.yaml`) — legacy; JSON is canonical
- Process docs: `kebab-case.md` (e.g., `register-run.md`)

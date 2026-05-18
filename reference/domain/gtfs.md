# GTFS Reference

Essentials for working with GTFS Schedule and GTFS-RT (Realtime) in the SIMOVI stack. Both Databús and Infobús consume and/or produce these formats.

## GTFS Schedule

### Key Files and Required Fields

| File | Required Fields | Purpose |
|---|---|---|
| `agency.txt` | `agency_id`, `agency_name`, `agency_url`, `agency_timezone` | Transit agency/operator definition |
| `routes.txt` | `route_id`, `route_short_name` or `route_long_name`, `route_type` | Route definitions (bus=3, rail=2, etc.) |
| `trips.txt` | `route_id`, `service_id`, `trip_id` | Individual trip instances on a route |
| `stop_times.txt` | `trip_id`, `arrival_time`, `departure_time`, `stop_id`, `stop_sequence` | Ordered stop schedule for each trip |
| `stops.txt` | `stop_id`, `stop_name`, `stop_lat`, `stop_lon` | Stop/station definitions |
| `calendar.txt` | `service_id`, `monday`–`sunday`, `start_date`, `end_date` | Weekly service pattern |
| `calendar_dates.txt` | `service_id`, `date`, `exception_type` | Exceptions to calendar (holidays, extras) |
| `shapes.txt` | `shape_id`, `shape_pt_lat`, `shape_pt_lon`, `shape_pt_sequence` | Geographic path of trips (optional but used) |
| `feed_info.txt` | `feed_publisher_name`, `feed_lang`, `feed_version` | Feed metadata, version tracking |

### Time and Date Format Rules

**Time (`HH:MM:SS`)**: GTFS times use a 24-hour clock that **can exceed 24:00:00**. Times after midnight on a service day are represented as hours > 23 (e.g., `25:30:00` = 1:30 AM the following calendar day). Always treat GTFS times as offsets from service-day noon-minus-12h, not as wall-clock times. Never parse them with `datetime.time()` directly.

**Date (`YYYYMMDD`)**: All dates are encoded as 8-digit integers without separators (e.g., `20251201`). Calendar validity is determined by the intersection of `calendar.txt` (weekly pattern) and `calendar_dates.txt` (exceptions with `exception_type=1` for added service, `exception_type=2` for removed service).

### `stop_sequence` Semantics

`stop_sequence` is **1-indexed** and **non-contiguous** — values only need to be positive integers in ascending order. Never assume consecutive values (e.g., a trip may have stop_sequence values 1, 5, 10, 15). Always use `ORDER BY stop_sequence` rather than relying on row order. The terminal stop is the entry with the highest `stop_sequence` for a given `trip_id`; this is used by Databús's `is_at_terminal_stop` guard to detect run completion.

## GTFS-RT (Realtime)

### FeedMessage Protobuf Structure

A GTFS-RT feed is a serialized `FeedMessage` protobuf with a `FeedHeader` and a list of `FeedEntity` objects.

```
FeedMessage
  header: FeedHeader
    gtfs_realtime_version: "2.0"
    incrementality: FULL_DATASET | DIFFERENTIAL
    timestamp: (Unix epoch seconds)
  entity[]: FeedEntity
    id: string (unique per entity in this feed)
    is_deleted: bool (DIFFERENTIAL only)
    trip_update: TripUpdate       (one of these three)
    vehicle: VehiclePosition
    alert: Alert
```

### Entity Types

**VehiclePosition**: Real-time location of a vehicle. Key fields: `vehicle.id`, `trip.trip_id`, `trip.route_id`, `position.latitude`, `position.longitude`, `position.bearing`, `position.speed`, `current_stop_sequence`, `current_status` (IN_TRANSIT_TO, STOPPED_AT, INCOMING_AT), `timestamp`.

**TripUpdate**: Predicted arrival/departure times per stop. Key fields: `trip.trip_id`, `trip.route_id`, `vehicle.id`, `stop_time_update[]` (each with `stop_sequence`, `arrival.time`, `departure.time`, `schedule_relationship`).

**Alert**: Service alerts (delays, detours, closures). Key fields: `informed_entity[]` (routes/trips/stops affected), `cause`, `effect`, `header_text`, `description_text`.

### Incrementality Modes

**`FULL_DATASET`** (default in Databús): Every feed publication contains the complete current state. Consumers discard their previous snapshot and replace it entirely. Simpler to implement; higher bandwidth per publish cycle.

**`DIFFERENTIAL`**: Only changed entities are included; `is_deleted=true` signals removal. Requires consumers to maintain state across updates. Not currently used in Databús but supported by the GTFS-RT spec.

### Databús Feed Publishing

Databús publishes two separate `FeedMessage` files every 15 seconds:
- `vehicle_positions` — all active run VehiclePositions
- `trip_updates` — all active run TripUpdates

Both are written to `backend/feed/files/` in `.pb` (binary protobuf) and `.json` (text) formats. The header uses `incrementality: FULL_DATASET` and sets `gtfs_realtime_version: "2.0"`. See [`behavior/databus/system/docs/build-gtfs-realtime.md`](../../behavior/databus/system/docs/build-gtfs-realtime.md) for the full process specification.

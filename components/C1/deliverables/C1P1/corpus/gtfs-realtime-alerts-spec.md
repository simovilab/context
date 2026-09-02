# GTFS-Realtime: Service Alerts Feed

GTFS-Realtime (GTFS-RT) is a companion feed specification to GTFS
Schedule, published by Google and now stewarded through the same
open, MobilityData-supported process. It uses Protocol Buffers (protobuf)
rather than CSV, and defines three independent feed entities: Trip
Updates, Vehicle Positions, and Service Alerts. A GTFS-RT feed does not
replace GTFS Schedule — it must be consumed alongside a valid static
feed, which it references by shared IDs (route_id, trip_id, stop_id).

## The Service Alerts feed

Service Alerts communicate unscheduled disruptions or informational
notices: detours, stop closures, delays, service changes, or
accessibility issues. Each `Alert` message contains:

- **Informed entities** — the routes, trips, stops, or agency the alert
  applies to, allowing consumers to scope an alert precisely (e.g., a
  single stop rather than an entire route).
- **Active period(s)** — one or more start/end Unix timestamps during
  which the alert is in effect; an open-ended period has no end time.
- **Cause and effect enums** — a structured cause (e.g., `CONSTRUCTION`,
  `WEATHER`, `TECHNICAL_PROBLEM`) and effect (e.g., `DETOUR`,
  `REDUCED_SERVICE`, `NO_SERVICE`, `STOP_MOVED`) that let downstream
  applications render consistent icons and filters without parsing free
  text.
- **Header and description text** — human-readable summaries, each
  supporting multiple languages via `TranslatedString` entries.
- **Severity level** (added in later spec revisions) — an optional
  enum (`INFO`, `WARNING`, `SEVERE`) to help UIs prioritize alerts.

## Publication practices

Feeds are typically served over HTTP as a binary protobuf response,
refreshed on a short interval (commonly 15–60 seconds for alerts, since
they change less frequently than vehicle positions). Consumers are
expected to treat a fetch as a full replacement of the alert set, not an
incremental diff, unless the feed explicitly declares differential
updates via the `incrementality` field introduced in the specification.

Good practice for producers is to keep alert text concise, avoid
duplicating information already conveyed by the enums, and retire
alerts promptly once the underlying condition ends, since stale alerts
erode rider trust in the feed.

**Source**: GTFS-Realtime Reference (Service Alerts), gtfs.org / Google
Transit APIs public specification.

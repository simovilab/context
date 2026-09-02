# GTFS Schedule: Core Files and Required Fields

GTFS Schedule (formerly "GTFS static") is an open, widely adopted data
specification for describing scheduled public transport service: routes,
trips, stops, and timetables. It was originally developed by Google and
Portland's TriMet and is now maintained collaboratively via the
MobilityData organization and the open `gtfs.org` community process.

## Required files

A conformant GTFS Schedule feed is a ZIP archive of comma-separated text
files. The specification distinguishes required, optional, and
conditionally required files. The commonly required set includes:

- `agency.txt` — one or more transit agencies providing the data, with
  name, URL, and timezone.
- `stops.txt` — physical locations where vehicles pick up or drop off
  riders (stop_id, name, latitude/longitude).
- `routes.txt` — transit routes, each with a route_id, short/long name,
  and a `route_type` (bus, rail, ferry, etc.).
- `trips.txt` — individual trips along a route, linking a route to a
  service pattern (via `service_id`) and to an ordered stop sequence.
- `stop_times.txt` — the arrival/departure time of each trip at each
  stop, defining the actual timetable.
- `calendar.txt` and/or `calendar_dates.txt` — the days of the week (or
  specific exception dates) on which a service pattern operates.

## Optional but high-value files

- `shapes.txt` — the physical path (polyline) a vehicle follows, used for
  map rendering.
- `fare_attributes.txt` / `fare_products.txt` — fare information.
- `feed_info.txt` — publisher metadata and, importantly, a feed version
  identifier used to track updates over time.
- `frequencies.txt` — headway-based service description, for routes
  scheduled by frequency rather than exact stop times.

## Field-level discipline

Each field has a defined type (ID, text, enum, time, currency, coordinate)
and a required/optional/conditional status. Producers should validate
referential integrity (e.g., every `route_id` in `trips.txt` exists in
`routes.txt`) and use tools such as the MobilityData `gtfs-validator` to
catch structural and semantic errors before publication.

**Source**: GTFS Schedule Reference, gtfs.org (public specification,
maintained by MobilityData and the GTFS community).

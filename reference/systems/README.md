# Systems

Per-system canonical overviews for all SIMOVI backend platforms.

- [`databus.md`](databus.md) — Databús: the GTFS Schedule + Realtime producer; core transit data backend that ingests telemetry, manages run lifecycles, and publishes GTFS-RT feeds.
- [`infobus.md`](infobus.md) — Infobús: the passenger-facing real-time transit information platform built on Django + GTFS + Nuxt; consumes Databús GTFS-RT feeds and pushes display updates to kiosks and web clients.

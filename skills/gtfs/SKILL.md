---
name: gtfs
description: "Load when touching GTFS models, feed parsing, spec compliance, or protobuf. Defers to reference/domain/gtfs.md for the full spec."
---

# Skill: gtfs

Load this skill when working with GTFS Schedule files, GTFS Realtime protobufs, the `gtfs-django` PyPI package, or feed validation. The canonical spec reference lives in this repo.

## What this skill contains

This skill defers to the canonical reference at `reference/domain/gtfs.md` in the same repo. Read that file when this skill loads — it contains the full GTFS Schedule file/field reference, GTFS-RT protobuf structure, and common mistakes.

## Key invariants

- **`timestamp` is Unix epoch seconds**, not milliseconds. Using milliseconds is a silent data corruption bug.
- **`stop_sequence` is non-contiguous** — never assume +1 increments. Always use the exact value from `stop_times.txt`.
- **Times in `stop_times.txt` can exceed `24:00:00`** for trips crossing midnight. `25:30:00` is valid.
- **Dates use `YYYYMMDD` format** (no dashes): `20260517`, not `2026-05-17`.
- **`trip_id` in the RT feed must match GTFS Schedule exactly** — watch for trailing spaces and encoding differences.
- `stop_time_update` entries in a `TripUpdate` must be in `stop_sequence` order and represent upcoming stops only.
- `incrementality = FULL_DATASET` when replacing the entire feed (not differential).

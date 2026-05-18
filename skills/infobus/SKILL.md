---
name: infobus
description: Skill for working inside the infobus repo — SIMOVI's passenger-facing real-time transit information platform built on Django + GTFS + Nuxt. Load when working on any infobus service. Sourced from README.md, ARCHITECTURE.md, AGENTS.md, compose.dev.yml, backend/ + frontend/ layout (as of 2026-04-22, main branch).
---

# Skill: infobus

Load this skill when working inside the `infobus` repo or on any service that displays or distributes transit information to passengers. Also load when working on the MCP/SPARQL surface (`context/`, `knowledge/`), screen management, or WebSocket display feeds.

## What this skill contains

This skill defers to the canonical reference at `reference/systems/infobus.md` in the same repo. Read that file when this skill loads — it contains the full repo structure, compose services table, Django apps, and the display/API data flow.

## Key invariants

- **infobus NEVER produces GTFS-RT** — it only consumes the feed from `databus`. Never write code in infobus that generates protobuf feeds.
- `databus` = data producer (authoritative truth). `infobus` = experience + enrichment layer. They are stacked, not parallel.
- Screens have geographic coordinates (PostGIS `Point`) — always query via spatial filters, not string matching.
- GTFS models live in the `feed` Django app, which wraps the **`gtfs-django` PyPI package**. The old `django-app-gtfs` git submodule was replaced; import from `feed`, not from any shim.
- Celery Beat schedule is in Django admin, not hardcoded in settings.
- Use Docker service names between containers: `DB_HOST=database`, `REDIS_HOST=memory`, RabbitMQ=`broker`, MCP=`context`, SPARQL=`knowledge`.
- WebSocket endpoints (`/ws/`) need Daphne/ASGI — don't fall back to WSGI `runserver` for those features.
- Dev default superuser is `admin/admin` — never use in production.

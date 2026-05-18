# AGENTS.md — SIMOVI Agent Reference Layer

This repository is the **canonical, cross-tool reference layer for any AI agent working on SIMOVI systems**. It contains architectural knowledge, domain vocabulary, naming conventions, process state machines, and vendored workflow skills that any agent — regardless of which tool hosts it — can read and act on. It is not a codebase; it is the shared context that makes agents effective across Databús, Infobús, and future SIMOVI systems.

## Who should read this

Any agent in any tool: **Warp**, **GitHub Copilot**, **Claude Code**, **Cursor**, or any future assistant. This file is the universal entry point — everything else in this repo is reachable from here in at most two link-hops.

## How to use this repo from your tool

**Warp** — Point Warp's AI Rules at this file; all content is reachable via links from here.

**GitHub Copilot** — Add a one-line pointer to this file in `.github/copilot-instructions.md` in your project repo, or open this repo in VS Code alongside your project repo and Copilot will read it automatically.

**Claude Code** — Read this file on session start; optionally install skills from [`skills/`](skills/) by symlinking or copying the subdirectories into `~/.claude/skills/` (see [`skills/README.md`](skills/README.md) once written in PR 2).

## Where things live

| Looking for | Path |
|---|---|
| System overviews (databus, infobus) | [`reference/systems/`](reference/systems/) |
| Naming conventions, GTFS spec, transit vocabulary | [`reference/domain/`](reference/domain/) |
| Architecture, system design, data principles | [`reference/principles/`](reference/principles/) |
| State machines and process specs (FSMs) | [`behavior/`](behavior/) |
| Vendored agent skills (Claude Code) | [`skills/`](skills/) |
| Starter files for new project repos | [`templates/`](templates/) |

## Conventions

- **Kebab-case filenames** everywhere in this repo.
- **One process = one FSM JSON + one prose `.md`** in `behavior/`, following the existing pattern.
- **Two-hop reachability**: anything an agent should find must be reachable from this file in ≤ 2 link-hops.
- **System-level architectural context lives in `reference/systems/`**, not in downstream `AGENTS.md` files — downstream repos keep only operational guidance (commands, ports, env vars, project-specific patterns).
- **PRs for canonical content go through review** on the integration branch before landing on `main`.

## What does NOT belong here

- **Operational/codebase-specific guidance** (commands, ports, env vars, local dev setup) — those belong in the downstream repo's own `AGENTS.md`.
- **Tool-specific syntax** (Claude Code slash commands, hooks, keybindings) — keep those in `skills/` or personal tool configuration, not in reference content.
- **Secrets, credentials, or internal URLs** — never committed here.

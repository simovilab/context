# context — SIMOVI Agent Reference Layer

This repo is the org-wide knowledge base for SIMOVI: it holds system architecture docs, domain vocabulary, naming conventions, GTFS reference material, process state machines, and reusable agent skills. It is not runnable code — it is the shared context that keeps AI agents and human engineers aligned across projects.

## Who it's for

SIMOVI org members and any AI agent (Copilot, Claude Code, Warp, Cursor, etc.) working on Databús, Infobús, or future SIMOVI systems.

## Quick start

**Warp users** — Nothing to install. Open this repo, point your AI Rules at `AGENTS.md`, and every linked document is reachable from there.

**Copilot users** — Same as Warp, or add a one-line pointer in your project's `.github/copilot-instructions.md`:
```
See https://github.com/simovilab/context/blob/main/AGENTS.md for system context.
```

**Claude Code users** — Optionally symlink or copy the subdirectories in `skills/` into `~/.claude/skills/` to get workflow shortcuts. See `skills/README.md` for details once it's written (PR 2).

## Contributing

1. Branch off `main` (or the current integration branch if one is open).
2. Edit or add content following the conventions in [`AGENTS.md`](AGENTS.md).
3. Open a PR; at least one reviewer must approve before merge.
4. Canonical content on `reference/systems/*.md` files requires a "Last verified" date update on each edit.

## Where to learn more

See [`AGENTS.md`](AGENTS.md) for the structured, agent-facing version of this index — it maps every topic to the file that covers it and explains the conventions any agent should follow when reading or updating this repo.

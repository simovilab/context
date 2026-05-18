# Templates

Starter files for new SIMOVI project repos, plus proposed slim replacements for existing downstream `AGENTS.md` files.

## What's in this directory

| File | Purpose |
|---|---|
| `AGENTS.md` | Generic `AGENTS.md` starter for any new SIMOVI project repo. Copy to project root and fill in the placeholders. |
| `.mcp.json` | MCP config skeleton. Copy to project root and populate `mcpServers` when SIMOVI MCP servers exist. |
| `databus-AGENTS.md` | Proposed slim replacement for `../databus/AGENTS.md` (~120 lines vs. ~275). Keeps operational content; replaces architectural sections with a pointer to `context/reference/systems/databus.md`. |
| `infobus-AGENTS.md` | Proposed slim replacement for `../infobus/AGENTS.md`. Reality-checked against current infobus repo state (not the stale source AGENTS.md). |

## How to use the generic AGENTS.md starter

Copy `AGENTS.md` to your project root and fill in the four placeholder sections:
- Project overview paragraph
- Tech stack list
- Development commands
- Project-specific conventions

The "System context" section already points to the canonical reference in this repo — leave it as-is, substituting the correct `<system>` name.

## How to use the downstream proposals

`databus-AGENTS.md` and `infobus-AGENTS.md` are **proposals** — they are not auto-applied. To use one:

1. Review the proposal alongside the current `AGENTS.md` in the target repo.
2. Copy the proposal content into the target repo's `AGENTS.md`.
3. Open a PR in that repo for review.

These proposals live here so they can be reviewed in context before touching the downstream repos.

## How to use .mcp.json

Copy `.mcp.json` to your project root. When SIMOVI MCP servers exist, add them to the `mcpServers` object following the Claude Code MCP config format. The `_comment` key is ignored by Claude Code and exists only as a human-readable note.

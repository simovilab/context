# Skills

SIMOVI-specific Claude Code skills, vendored here as org-shared assets. Each skill is a Claude Code skill file (`SKILL.md`) that an agent loads to get domain context or workflow guidance for SIMOVI systems.

## What's in this directory

| Skill | Type | Description |
|---|---|---|
| `databus/` | Reference pointer | Working in the databus monorepo (GTFS-RT producer). Defers to `reference/systems/databus.md`. |
| `infobus/` | Reference pointer | Working in the infobus repo (passenger info platform). Defers to `reference/systems/infobus.md`. |
| `gtfs/` | Reference pointer | GTFS Schedule + Realtime spec essentials. Defers to `reference/domain/gtfs.md`. |
| `fsm2ref/` | Workflow | Refactor an XState machine to match Databús naming conventions and sync the reference spec. Self-contained. |
| `src2fsm/` | Workflow | Compare the codebase against an FSM JSON and surface drift for triage. Self-contained. |

## How to install (Claude Code users)

**Symlink — recommended for active contributors** (changes to this repo reflect immediately):

```bash
# Run from the root of this repo
for skill in databus infobus fsm2ref src2fsm gtfs; do
  ln -sf "$(pwd)/skills/$skill" ~/.claude/skills/$skill
done
```

**Copy — one-shot install** (snapshot, not live):

```bash
for skill in databus infobus fsm2ref src2fsm gtfs; do
  cp -r "skills/$skill" ~/.claude/skills/
done
```

After install, reload Claude Code for the skills to appear.

## Dependency note

The trimmed skills (`databus`, `infobus`, `gtfs`) reference canonical content in `reference/` — they tell the agent *where to look*, but the experience is best when this whole repo is cloned alongside your project repos so relative paths resolve. If you're not cloning the repo, point the agent at the GitHub raw URLs listed in each skill file instead.

## What this directory is NOT

- **Not a plugin marketplace.** These are plain Claude Code skill files — no auto-update, no registry.
- **Not tool-agnostic.** The `SKILL.md` format is specific to Claude Code. For other tools (Warp, Copilot, Cursor), agents read `AGENTS.md` directly.
- **Not auto-applied.** You install them; you decide which skills to load per session.

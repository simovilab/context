# InfoTP Context Studio

InfoTP is the national public-transport information project driven by SIMOVI, EIE-UCR, and Fundación UCR. This repository is **InfoTP Context Studio**: a git-first, self-hosted store that authors and serves the project's context — its rules, standards, specs, and reference material — to AI coding agents and human contributors alike. It holds no runnable application code; it holds versioned context, organized as cascading configuration from the project down through components to individual deliverables.

This is the `infotp` branch of `simovilab/context` — a separate axis from the bUCR content that lives on `main`.

## Orientation

```
project/        Cross-cutting project-layer context (brief, project-wide directives)
components/     Component and deliverable nodes (C1..C7), each a self-contained folder
.composed/      Generated context: <ID>.json (for MCP) and <ID>.md (for humans) — never hand-edit
schemas/        JSON Schemas for node.yaml and directives.yaml
AGENTS.md       Entry point for AI agents working in this repo
```

Start with `AGENTS.md` for the full model (directive vs. reference context, composition rules, the 10 locked design decisions).

## Contributing

1. Branch off `infotp`.
2. Edit the relevant node folder(s) under `project/` or `components/C#/…` — never edit `.composed/` directly.
3. Open a PR. Edit authority scales with blast radius: project/component changes need a coordinator, leaf changes need the node owner.
4. CI regenerates `.composed/` from your changes on merge.

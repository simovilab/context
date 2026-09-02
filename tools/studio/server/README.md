# InfoTP Context Studio — server

Local API server over the git context store (`project/`, `components/C#/`,
`components/C#/deliverables/C#P#/`). See `../CONTRACT.md` for the full
endpoint/data-shape contract. This server never talks to any external
service; it only reads/writes the local working tree and shells out to the
Python composer.

## Requirements

- Node 20+ (workspaces: this package lives at `tools/studio/server`, the root
  workspace is `tools/studio/`).
- A Python environment with `infotp_composer` installed
  (`uv pip install -e tools/composer` from the repo root).

## Environment variables

| Var                    | Default        | Meaning                                                          |
|-------------------------|---------------|-------------------------------------------------------------------|
| `STUDIO_PYTHON`          | `python3`     | Python interpreter to invoke `-m infotp_composer` with. Point this at the venv where `infotp_composer` is installed. |
| `STUDIO_REPO`            | auto-discover | Context repo root. Auto-discovery walks up from CWD for a dir containing both `schemas/` and `project/`. |
| `PORT` / `STUDIO_PORT`   | `4317`        | HTTP port.                                                        |
| `STUDIO_TOKEN_BUDGET`    | `4000`        | Per-leaf token budget used by `/api/config` and `/api/budget`.   |
| `STUDIO_TOKENIZER`       | `heuristic`   | `heuristic` or `tiktoken` — passed to every composer invocation. |

## Run (dev)

```bash
cd tools/studio
pnpm install
STUDIO_PYTHON=/path/to/venv/bin/python STUDIO_REPO=/path/to/context pnpm --filter ./server run dev
```

You can also pass `--repo <path>` as a CLI arg instead of `STUDIO_REPO`.

## Run (built)

```bash
pnpm --filter ./server run build
pnpm --filter ./server run start
```

If `../web/dist` exists, the server also serves the built web app statically
at `/`. In dev, run the web app separately (Vite dev server proxies `/api`
to this server) — see `tools/studio/web/README.md`.

## Important note: no git integration in P2

Saving a node (`PUT /api/node/:id`) writes the working tree only — it does
**not** run `git add`/`commit`, and it does not open a PR. Committing and
pushing is a manual step for the human author. This matches the P2 scope in
`CONTRACT.md` ("Non-goals for P2"): git commit/PR creation from the UI is out
of scope.

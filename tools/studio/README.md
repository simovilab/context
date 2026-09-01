# InfoTP Context Studio (P2)

A **local, self-hosted** authoring UI for this context store. It reads and writes
the tree files (`node.yaml`, `directives.yaml`, prose) and shells out to the
Python composer (`tools/composer`) for composition, validation, and token
estimates. It never talks to any external service.

- `server/` — Node/TypeScript API (Express) over the store + composer. Port 4317.
- `web/` — React/Vite authoring UI: tree browser, node & directive editors,
  composed panel, live token meter, budget view.
- `CONTRACT.md` — the single source of truth for the server↔web seam.

## Prerequisites

1. The composer, installed in the Python you point the server at:
   ```
   pip install -e "tools/composer[tokenizers]"   # [tokenizers] enables the tiktoken meter
   ```
2. Node 18+ and npm.

## Run (dev)

```
cd tools/studio
npm install
STUDIO_PYTHON=/path/to/python-with-composer \
STUDIO_REPO=/path/to/this/repo \
npm run dev          # server on :4317, web on Vite's port proxying /api
```

For a production-style single process: `npm run build && STUDIO_PYTHON=... npm start`
(the server then serves `web/dist` at `/`).

## Environment

| Var | Default | Meaning |
|---|---|---|
| `STUDIO_PYTHON` | `python3` | Interpreter that has `infotp_composer` importable |
| `STUDIO_REPO` | auto-discovered | Repo root (dir containing `schemas/` + `project/`) |
| `STUDIO_PORT` / `PORT` | `4317` | Server port |
| `STUDIO_TOKEN_BUDGET` | `4000` | Per-node directive-token ceiling for the meter |
| `STUDIO_TOKENIZER` | `tiktoken` | **Display** tokenizer for the live meter/budget |

## Two tokenizers, on purpose (D9)

- The **live meter and budget** use an accurate tokenizer (`tiktoken` proxy for
  the target model) — computed on the fly, **never written to disk**.
- The **committed `.composed/` artifacts** always use the offline, deterministic
  `heuristic` tokenizer, so they stay byte-stable and match the CI
  `compose --check` gate without needing the `[tokenizers]` extra.

So the number in the UI (accurate) and the number in a committed `.composed/*.md`
(portable) are two clearly-labeled estimates of the same thing. Both are
approximations; the tokenizer interface is swappable (that is the point of D9).

## What Save does (and does not) do

Save writes the working tree (`node.yaml` / `directives.yaml` / prose) and
regenerates the affected `.composed/` output. **It does not commit or open a PR** —
you review the diff and commit in git yourself. Auth, multi-user, and corpus
upload (RAG, P3) are out of scope for P2.

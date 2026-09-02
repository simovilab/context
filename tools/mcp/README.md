# InfoTP Context MCP Server (P4)

The **third face** of the Context Studio. It serves the project's context to
**agents** over the Model Context Protocol (MCP), on **stdio**. The other faces
are the authoring UI (`tools/studio`, P2) and the git store (canonical).

This server is **read-only**: it never writes the store, never commits, never
mutates anything. It only reads the committed `.composed/*.json|md` artifacts and
shells out to the two Python CLIs (`infotp_composer`, `infotp_rag`).

It serves the two halves of the core model:

- **Directive context** — the composed, specificity-resolved, token-budgeted rule
  block for a node (inlined). From committed `.composed/<id>.json` (D4).
- **Reference context** — **branch-scoped** retrieval over a node's accumulated
  reference corpus (fetched on demand, D10). An agent scoped to `C1P1` can only
  retrieve `project` / `C1` / `C1P1` corpus — never a sibling branch. That
  scoping is enforced inside `infotp_rag` (parent-chain mask) and is this face's
  confidentiality boundary.

The frozen seam is `CONTRACT.md`.

## Tools

| Tool | Args | Serves |
|---|---|---|
| `list_nodes` | `layer?`, `component?` | The node catalog (from `.composed/*.json`). |
| `get_directives` | `node_id`, `live?` | Composed directive block for a node. `live` recomputes from the working tree; default reads committed `.composed/`. |
| `search_reference` | `node_id`, `query`, `k?`, `embedder?` | Branch-scoped RAG retrieval. |
| `get_budget` | `tokenizer?` | Per-branch worst-leaf token budget. |

Resources: `context://tree` (catalog JSON) and
`context://node/{id}/directives` (committed directive markdown).

## Run

```bash
cd tools/mcp
pnpm install
pnpm run build
node dist/index.js          # speaks MCP over stdio
# or, in dev:  pnpm dev
```

The process is meant to be spawned by an MCP client, not run interactively —
**stdout carries the JSON-RPC stream; all human logging goes to stderr.**

### Register with Claude Code

```bash
claude mcp add infotp-context -- node /ABS/PATH/tools/mcp/dist/index.js
```

or in a project `.mcp.json`:

```json
{
  "mcpServers": {
    "infotp-context": {
      "command": "node",
      "args": ["/ABS/PATH/tools/mcp/dist/index.js"],
      "env": { "STUDIO_PYTHON": "/ABS/PATH/.venv/bin/python" }
    }
  }
}
```

## Configuration

| Var | Default | Meaning |
|---|---|---|
| `INFOTP_REPO` / `STUDIO_REPO` / `--repo` | auto-discovered (`schemas/`+`project/`) | Repo root. `INFOTP_REPO` wins. |
| `STUDIO_PYTHON` | repo `.venv`, else `python3` | Interpreter with `infotp_composer`+`infotp_rag`. |
| `INFOTP_MCP_EMBEDDER` | `semantic` | Default `search_reference` embedder; per-request fallback to `hashing`. |
| `INFOTP_MCP_TOKENIZER` | `heuristic` | Tokenizer for `get_directives --live` / `get_budget` (matches committed `.composed/`). |

If the composer/RAG import fails when the server shells out, see
`tools/studio/README.md` → Troubleshooting (the macOS + Python 3.14 hidden-`.pth`
quirk applies identically here — this server reuses the same interpreter
resolution).

## Security posture

- **Read-only.** No write/commit/PR path exists.
- **Offline.** stdio only; no HTTP, no ports, no outbound network. The default
  embedder falls back to the offline `hashing` backend.
- **Input validation before any spawn**: `node_id` must match
  `^(project|C[1-7]|C[1-7]P[0-9]{1,2}|INF[1-3])$` and be in the catalog; `query`
  is length-capped; `k` is clamped. Spawns use argument arrays, never a shell
  string. Agent-facing errors are sanitized (no stack traces, no absolute paths).
- **No PII / secrets / internal URLs.** This server adds no data; it relays only
  what the store already commits (corpus `source` fields are provenance text).

## Non-goals

No authoring/writes (that's the Studio), no HTTP/SSE transport, no auth or
multi-tenant, no re-implementation of composition/chunking/embedding/scoping
(those live in Python behind the frozen D4/D10 contracts), no caching/reload.

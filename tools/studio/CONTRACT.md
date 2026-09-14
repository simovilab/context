# InfoTP Context Studio — P2 authoring app contract

This is the **single source of truth** for the seam between the Studio server
(`tools/studio/server`, Node/TS) and the Studio web app (`tools/studio/web`,
React/TS). Both are built against this file. Do not diverge from it; if a change
is needed, it must change here first.

The Studio is a **local, self-hosted** authoring UI over the git context store.
It never talks to any external service. It reads and writes the tree files
(`node.yaml`, `directives.yaml`, `reference.md`, `corpus/`) and shells out to the
Python composer (`python -m infotp_composer`) for composition, validation, and
token estimates. The composer is authoritative for composition and tokens; the
server never re-implements composition.

## Repo geometry (paths are relative to the context repo root)

- Context tree: `project/`, `components/C#/`, `components/C#/deliverables/C#P#/`
- Composed output (composer-generated, read-only for the app): `.composed/<ID>.{json,md}`
- Composer CLI: `python -m infotp_composer compose <ID>|--all|--check [--tokenizer heuristic|tiktoken] [--stdout] [--json]`
- The server resolves the repo root by walking up from its CWD to find a dir
  containing both `schemas/` and `project/` (same rule the composer uses), or
  takes `--repo <path>` / `STUDIO_REPO` env.

## Composer invocations the server relies on (provided by the Python track)

- `python -m infotp_composer compose <ID> --tokenizer <t> --stdout --json`
  → prints the composed node as JSON to stdout **without writing files**
  (used for read + live preview). Exit non-zero + stderr message on
  validation/compose error.
- `python -m infotp_composer compose <ID> --tokenizer <t>` → writes
  `.composed/<ID>.{json,md}` (used after a save).
- `python -m infotp_composer compose --all --tokenizer <t>` → rebuild all.
- `python -m infotp_composer budget --tokenizer <t> --json` → prints the
  branch worst-case-leaf budget report (shape in `GET /api/budget` below).

## Data shapes (TypeScript)

```ts
type Layer = "project" | "component" | "deliverable";
type Kind = "software" | "data" | "docs" | "api" | "infra" | "research";
type Op = "set" | "extend" | "suppress";

interface Directive {
  key: string;              // dotted kebab, e.g. "security.transport-encryption"
  op: Op;
  applies_to: Kind[];
  text?: string;            // required unless op === "suppress"
  lang?: "en" | "es";       // default "en"
}

interface NodeFields {      // mirrors node.yaml (schemas/node.schema.json)
  id: string;
  name: string;
  component?: string;
  result?: { type: string; visibility: "public" | "internal" | "restricted" };
  status: "not-started" | "in-progress" | "blocked" | "done";
  owner: string[];          // role IDs, e.g. ["RH5"]
  kind: Kind[];
  depends_on: string[];     // node IDs
  hito?: "A"|"B"|"C"|"D"|"E"|"F";
  due_month?: number;       // 1..16
}

interface TreeNode extends NodeFields {
  layer: Layer;
  parent: string | null;    // project->null, component->"project", deliverable->component id
  children: string[];       // ids of child nodes in the hierarchy
}

interface EffectiveDirective {   // as emitted in .composed/<ID>.json
  key: string; text: string; applies_to: Kind[]; lang: string; sources: string[];
}
interface ComposedView {
  id: string; name: string; component: string | null; kind: Kind[];
  status: string; owner: string[]; result: object | null; depends_on: string[];
  hito: string | null; due_month: number | null; chain: string[];
  // Note: the composed JSON is a pure function of source (no volatile
  // timestamp), so regenerating without source changes is a no-op in git.
  directives: EffectiveDirective[];
  reference: { file: string; source: string; path: string }[];
  token_estimate: { directives: number; reference: number; total: number; method: string };
}

interface NodeDetail {
  id: string; layer: Layer;
  fields: NodeFields;
  localDirectives: Directive[];   // this node's OWN directives.yaml (editable)
  composed: ComposedView;         // full inherited/filtered result (read-only)
  referenceMd: string;            // reference.md / charter.md / brief.md prose (editable)
  proseFile: string;              // which prose file backs referenceMd
  corpus: string[];               // filenames in corpus/ (any layer)
}
```

## REST API (server, JSON over HTTP, default port 4317)

All responses use the envelope `{ ok: true, data: <T> } | { ok: false, error: string }`.

- `GET /api/config`
  → `{ tokenBudget: number, tokenizer: "heuristic"|"tiktoken", repoRoot: string }`
  `tokenBudget` default **4000** (server config / `STUDIO_TOKEN_BUDGET`).

- `GET /api/tree`
  → `{ nodes: TreeNode[], roots: ["project"] }` — the full hierarchy plus each
  node's `depends_on` (the DAG edges). Built by reading every `node.yaml`.

- `GET /api/node/:id`
  → `NodeDetail`. `composed` comes from `compose <id> --stdout --json`.

- `PUT /api/node/:id`
  body: `{ fields?: Partial<NodeFields>, localDirectives?: Directive[], referenceMd?: string }`
  Writes the changed files (node.yaml / this node's directives.yaml / prose file),
  then recomposes: the edited node with `compose <id>`, and if the node is
  `project` or a component (blast radius), `compose --all`. Returns the updated
  `NodeDetail`. On composer validation failure, roll back nothing but return
  `{ ok:false, error }` with the composer's stderr and DO NOT leave `.composed`
  stale (re-run compose on the last-good tree is not required; surface the error).
  Edits are constrained by edit-authority (D8) only via a soft warning header
  `X-Blast-Radius: project|component|leaf` in the response — no hard block in P2.

- `GET /api/budget`
  → `{ tokenBudget: number, components: { component: string; worstLeaf: { id: string; tokens: number } }[], overflows: string[] }`
  Sourced from `budget --json`. `overflows` = ids whose composed directive tokens exceed `tokenBudget`.

- `POST /api/recompose` → runs `compose --all`; returns `{ recomposed: number }`.

- `POST /api/node/:id/corpus` (any layer — project and component corpus is
  first-class; reference context accumulates down the chain) → body
  `{ file: string, content?: string, contentB64?: string, title?, source?, license?, lang? }`.
  **Exactly one of `content`** (UTF-8 text, the original paste-a-document path,
  unchanged) **or `contentB64`** (standard base64 of the raw file bytes, no
  data-URL prefix — written binary-safely for PDFs/images/office docs). The
  incoming `file` name is sanitized server-side to kebab-case: lowercase,
  spaces/underscores → dashes, anything outside `[a-z0-9.-]` stripped, extension
  preserved (identity for names that already validate). Extension allowlist:
  text `md txt csv json yaml yml xml html`; `pdf`; images
  `png jpg jpeg gif svg webp`; office `docx xlsx pptx` — anything else → 400.
  Hard cap **10 MB decoded** (either form) → 400. This is the one route that
  accepts request bodies up to **16 MB** (per-route `express.json`; every other
  route keeps the 5 MB default) so a 10 MB base64 payload + JSON wrapper fits.
  On success: file written to `<node>/corpus/<file>`, manifest entry upserted,
  → `{ entries: CorpusEntry[] }`. Recompose blast radius: the edited node is
  recomposed; if it is `project` or a component, **all** nodes are (every
  descendant inherits the corpus — same rule as `PUT`). `DELETE
  /api/node/:id/corpus/:file` follows the same recompose rule.

- `GET /api/node/:id/corpus/:file/raw`
  → raw file **bytes** with `Content-Type` mapped from the extension
  (pdf → application/pdf; png/jpg/jpeg/gif/webp → image/*; svg → image/svg+xml;
  txt/csv/md/json/yaml/yml/xml/html → matching text/application type with
  charset=utf-8; any other extension → application/octet-stream) and
  `Content-Disposition: inline; filename="<file>"`. **This is the one
  documented exception to the response envelope**: a 200 streams the file body
  directly instead of `{ ok, data }` — binaries cannot survive the JSON
  `content: string` read (UTF-8 corruption), and `<img>`/`<iframe>`/download
  links need a real Content-Type. Error responses still use the envelope.
  Same path-traversal/filename guard as the corpus text read; unlike it, any
  extension matching the manifest filename pattern is served (the schema
  allows more than .md/.txt even though text authoring does not).

- Static: the server serves the built web app (`web/dist`) at `/` in production;
  in dev, Vite runs the web on its own port and proxies `/api` to the server.

## Web app (React + Vite + TS) — required screens

1. **Tree browser** (left): collapsible project → components → deliverables, each
   row showing id, name, a status pill, and kind tags. Selecting a node loads it.
2. **Node view/editor** (center): editable `fields` form (status, owner, kind,
   depends_on, result, hito, due_month — id/name read-only for existing nodes);
   a **directive editor** for `localDirectives` (add/remove/edit key, op,
   applies_to multiselect, text, lang); a prose editor (`referenceMd`, textarea/
   markdown). A **Save** button issues the `PUT` and refreshes.
3. **Composed panel** (right): the read-only `composed` result — effective
   directives grouped by key with their `sources` provenance, and the reference
   corpus list. A rendered view of `.composed/<id>.md` is acceptable.
4. **Token meter**: a bar showing `composed.token_estimate.total` (directives
   + reference corpus, RAG-fetched) vs
   `tokenBudget`, green/amber/red, with the number and method label. Updates on
   load and after save.
5. **Budget view**: a small table from `GET /api/budget` — worst-case leaf per
   component vs the budget, highlighting overflows (this is D9's per-branch
   worst-case-leaf guardrail).
6. A dependency-graph view is a NICE-TO-HAVE, not required for P2; if included,
   keep it a secondary tab. Do not block core authoring on it.

## Non-goals for P2 (explicitly out of scope)

- Git commit / PR creation from the UI (save writes the working tree only; the
  human commits). Note this in the UI copy and README.
- Auth / multi-user. It is a local single-user tool.
- RAG / corpus upload (that is P3). Corpus is shown read-only as filenames.

## Conventions

- TypeScript everywhere, strict mode. No secrets, no external network calls.
- Write YAML that round-trips against `schemas/*.json`; the composer validates on
  load, so a bad write surfaces as a composer error on save — surface it to the user.
- Keep files small and cohesive; match the repo's kebab-case for any new data files.

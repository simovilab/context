# InfoTP Context Studio — P3 RAG contract (D10)

This is the **single source of truth** for P3: per-node, branch-scoped
retrieval over the reference corpus. Every track builds against this file; if a
change is needed, it changes here first.

P3 realizes **D10**: the RAG interface is frozen (per-node `corpus/` manifest +
branch-scoped query); the embedding model and vector store are swappable behind
it. Reference context **accumulates** up the tree (union of every ancestor's
corpus) and is **fetched on demand** — it costs ~0 always-on tokens and never
inlines into composed directives, so the D9 token meter is unaffected.

Package manager: **uv** (Python), **pnpm** (JS). Self-hosted, no external
network calls, ever.

## Geometry (paths relative to the context repo root)

- Corpus files live in `components/C#/deliverables/C#P#/corpus/` (deliverables
  own corpus; components/project may too, and reference still accumulates down).
- **Manifest** (source of truth for a node's corpus): `<node>/corpus/manifest.yaml`,
  validated against `schemas/corpus.schema.json`. Shape:
  ```yaml
  entries:
    - file: gtfs-realtime-spec.md      # relative to this corpus/ dir, kebab-case, has extension
      title: GTFS Realtime Reference
      source: "Google Transit APIs, public spec"   # provenance; never an internal URL/secret
      license: CC-BY-4.0
      lang: en
  ```
  Only `file` is required. Supported file types for indexing in P3: `.md`, `.txt`
  (UTF-8 text). Other types may be listed but are skipped by the indexer with a
  warning (PDF extraction is future work).
- **Index** (derived build artifact, **gitignored**): `.rag/`. Never committed —
  embeddings are not byte-stable across backends/models; the corpus files +
  manifest are the committed truth. `.rag/` is rebuilt on demand.

## The frozen interface (D10) — Python, package `infotp_rag` in `tools/rag/`

`infotp_rag` depends on `infotp_composer` and reuses it as a library:
`Store.load(repo)`, `Store.parent_chain(id) -> [Node]` (project → … → node),
`Node.corpus` and the repo geometry. It never re-implements the tree walk.

Three swappable roles behind one facade. These Protocols are the frozen surface;
implementations swap freely underneath.

```python
# --- units ---------------------------------------------------------------
@dataclass(frozen=True)
class Chunk:
    text: str
    node_id: str        # the node whose corpus owns the source file (provenance)
    file: str           # corpus filename
    title: str | None   # from manifest
    ordinal: int        # chunk index within the file

@dataclass(frozen=True)
class RetrievedChunk:
    chunk: Chunk
    score: float        # cosine similarity in [-1, 1], higher = better

@dataclass(frozen=True)
class IndexStats:
    node_count: int
    file_count: int
    chunk_count: int
    embedder: str
    dim: int

# --- swappable role 1: embedding model -----------------------------------
class Embedder(Protocol):
    name: str
    dim: int
    def embed(self, texts: list[str]) -> "np.ndarray":  # shape (len(texts), dim), L2-normalized
        ...

# --- swappable role 2: vector store --------------------------------------
class VectorStore(Protocol):
    def add(self, vectors: "np.ndarray", chunks: list[Chunk]) -> None: ...
    def search(self, query: "np.ndarray", k: int, allowed_nodes: set[str]) -> list[RetrievedChunk]: ...
    def save(self, path: Path) -> None: ...
    @classmethod
    def load(cls, path: Path) -> "VectorStore": ...

# --- facade: the frozen RAG interface ------------------------------------
class Retriever(Protocol):
    def index(self, store: Store, node_id: str | None = None) -> IndexStats:
        """Index a node's corpus (or --all when node_id is None). Chunks are
        keyed by owning node_id so a later query can branch-scope."""
    def query(self, store: Store, node_id: str, text: str, k: int = 5) -> list[RetrievedChunk]:
        """Return the top-k chunks whose owning node is in parent_chain(node_id).
        Branch scoping is enforced HERE: allowed_nodes = {n.id for n in chain}."""
```

**Chunking:** split each text file into overlapping windows (~800 chars,
~150 overlap), on paragraph/sentence boundaries where possible. Deterministic
given the file bytes. Keep it a small, replaceable function.

### Default backends (must ship, CI-safe, zero network)

- `HashingEmbedder` — deterministic bag-of-hashed-tokens → fixed-dim vector,
  L2-normalized. Pure numpy + stdlib. `name = "hashing"`, `dim = 512` (config).
  This is the CI/reproducibility default, mirroring `HeuristicTokenizer` (D9).
- `NumpyStore` — flat matrix + parallel `list[Chunk]`; cosine via dot product on
  normalized vectors; `search` masks rows whose `node_id ∉ allowed_nodes` before
  top-k. Persists to a single `.rag/index.npz` (+ chunks sidecar JSON).
- `DefaultRetriever` — wires `HashingEmbedder` + `NumpyStore`.

### Optional backend (extra `[semantic]`, local, self-hosted)

- `SentenceTransformerEmbedder` — lazy-imports `sentence_transformers`; default
  model **`intfloat/multilingual-e5-small`** (small, strong, multilingual — the
  corpus is en+es), overridable via `INFOTP_RAG_MODEL`. `name =
  "st:<model>"`. Downloaded once to the local HF cache; no request-time network.
  Mirrors `TiktokenTokenizer` (D9). If the extra/model is absent, callers fall
  back to hashing and label it.
- `get_embedder(name="hashing"|"semantic"|"st:<model>") -> Embedder` factory,
  and `default_embedder()`.

## CLI (`python -m infotp_rag`)

```
python -m infotp_rag index <ID>              # index one node's branch-relevant corpus
python -m infotp_rag index --all             # index every node's corpus
python -m infotp_rag query <ID> "text" [-k 5] [--json]
    [--embedder hashing|semantic]            # default: hashing
    [--repo PATH]                            # default: auto-discover (same rule as composer)
```

- `index` writes `.rag/` (creating it). `query` loads `.rag/`; if missing or
  stale for the requested embedder, it builds in-memory first (never blocks).
- `query --json` prints `{ ok, embedder, node_id, k, results: [{score, text,
  node_id, file, title, ordinal}] }`. Non-zero exit + stderr on error.
- All paths self-discovered exactly like the composer (walk up for a dir with
  both `schemas/` and `project/`).

## Composer reconciliation (minimal, keep P1 green)

Today `infotp_composer` reads a node's corpus from the `node.yaml` `corpus:`
list. Update `_load_node_dir` to prefer `corpus/manifest.yaml` when present
(read its `entries[].file`), else fall back to the `node.yaml` `corpus:` list.
This keeps `.composed/*` reference lists accurate. **All existing composer tests
must stay green**; add a test for the manifest path. Do not change `.composed`
JSON shape.

## Studio seam (Track C — TS, extends P2)

Server (`tools/studio/server`) adds, per the P2 envelope
`{ ok:true, data } | { ok:false, error }`:

- `GET  /api/node/:id/corpus` → `{ entries: CorpusEntry[] }` (from manifest).
- `POST /api/node/:id/corpus` (deliverables only) → JSON body
  `{ file, content, title?, source?, license?, lang? }` where `content` is the
  UTF-8 text of the document (corpus files are `.md`/`.txt` text, so no
  multipart — mirrors the P2 PUT). Save `content` to `<node>/corpus/<file>`,
  add/replace its manifest entry, return the updated list. Reject any non-`.md`/
  `.txt` extension, any path traversal or non-schema filename, and any upload to
  a non-deliverable node.
- `DELETE /api/node/:id/corpus/:file` → remove the file + its manifest entry.
- `POST /api/node/:id/search` body `{ text: string, k?: number }` → shells
  `python -m infotp_rag query :id "text" -k <k> --embedder <searchEmbedder> --json`
  → `{ embedder, results: RetrievedChunk[], fallback: boolean }`. `fallback` is
  true when the configured `semantic` embedder was unavailable and the request
  was answered by `hashing` instead (so the UI can label it).

Config split, mirroring the two-tokenizer decision:
- `searchEmbedder` (default `semantic`) for the live search box (accurate).
- Corpus edits do **not** commit; the human commits (same as P2 Save).
- Add `STUDIO_RAG_EMBEDDER` env (default `semantic`, falls back to `hashing`
  with a labeled notice if the extra is missing).

Web (`tools/studio/web`) adds to the node view:
- **Corpus panel**: list manifest entries (file, title, source, license, lang);
  upload (deliverables only); delete. Read-only metadata display for provenance.
- **Retrieval search box**: query the node, render ranked chunks with a
  provenance badge (`node_id · file`) and score. Shows the embedder label.

Keep `CONTRACT.md` in `tools/studio/` authoritative for the P2 seam; this file
governs the P3 additions. Do not break any P2 endpoint.

## CI

Extend `.github/workflows/context-ci.yml`: after `compose --check`, run
`uv pip install --system -e "tools/rag[dev]"`, `infotp_rag index --all`
(hashing), and a smoke `infotp_rag query <a-node> "transit"` — asserting it
returns without network and exits 0. `.rag/` stays gitignored (never asserted
into the tree).

## Non-goals for P3

- MCP serving of retrieved context to agents — that is **P4**.
- PDF/binary extraction (list-but-skip in P3).
- Cross-branch / global search (branch scoping is the whole point).
- Committing the index, or any external embedding API.

## Conventions

- Python: uv, dataclasses, type hints, small cohesive modules, pytest with
  **synthetic fixtures** (never the live tree — determinism). Target 80%+ cov.
- TS: strict, pnpm, the P2 envelope, no external network calls.
- Never index or surface secrets/internal URLs/PII; `source` fields are
  provenance text only.

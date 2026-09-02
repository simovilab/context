// All HTTP endpoints from tools/studio/CONTRACT.md, using the
// { ok: true, data } | { ok: false, error } envelope throughout.

import { Router, type Request, type Response } from "express";
import { budget, composeAll, composeStdout, composeWrite, ComposerError } from "./composer.js";
import { addCorpusEntry, CorpusError, deleteCorpusEntry, readCorpus, readCorpusFile } from "./corpus.js";
import { RagError, search } from "./rag.js";
import { readNodeFiles, readTree, writeLocalDirectives, writeNodeFields, writeProseFile } from "./store.js";
import type {
  ApiEnvelope,
  Directive,
  Lang,
  Layer,
  NodeDetail,
  NodeFields,
  SearchEmbedder,
  Tokenizer,
} from "./types.js";

export interface StudioConfig {
  repoRoot: string;
  tokenBudget: number;
  // displayTokenizer drives the live meter/budget (accurate, e.g. tiktoken) and
  // is never persisted. writeTokenizer stamps the committed .composed/ artifacts
  // (canonical, offline-deterministic, matches the CI `compose --check` gate).
  displayTokenizer: Tokenizer;
  writeTokenizer: Tokenizer;
  // Embedder for the live retrieval search box (STUDIO_RAG_EMBEDDER, default
  // "semantic"); rag.ts falls back to "hashing" per-request if it errors.
  searchEmbedder: SearchEmbedder;
}

function ok<T>(res: Response, data: T, status = 200): void {
  const body: ApiEnvelope<T> = { ok: true, data };
  res.status(status).json(body);
}

function fail(res: Response, error: string, status = 500): void {
  const body: ApiEnvelope<never> = { ok: false, error };
  res.status(status).json(body);
}

/** Soft blast-radius classification for the X-Blast-Radius header (D8, no hard block in P2). */
function blastRadius(layer: Layer): "project" | "component" | "leaf" {
  if (layer === "project") return "project";
  if (layer === "component") return "component";
  return "leaf";
}

export function createRouter(config: StudioConfig): Router {
  const router = Router();
  const { repoRoot, tokenBudget, displayTokenizer, writeTokenizer, searchEmbedder } = config;

  router.get("/config", (_req: Request, res: Response) => {
    ok(res, { tokenBudget, tokenizer: displayTokenizer, repoRoot, searchEmbedder });
  });

  router.get("/tree", async (_req: Request, res: Response) => {
    try {
      const nodes = await readTree(repoRoot);
      ok(res, { nodes, roots: ["project"] });
    } catch (err) {
      fail(res, (err as Error).message);
    }
  });

  router.get("/node/:id", async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const fileData = await readNodeFiles(repoRoot, id);
      if (!fileData) {
        fail(res, `Unknown node id: ${id}`, 404);
        return;
      }
      const composed = await composeStdout(repoRoot, id, displayTokenizer);
      const detail: NodeDetail = {
        id,
        layer: fileData.layer,
        fields: fileData.fields,
        localDirectives: fileData.localDirectives,
        composed,
        referenceMd: fileData.referenceMd,
        proseFile: fileData.proseFile,
        corpus: fileData.corpus,
      };
      ok(res, detail);
    } catch (err) {
      if (err instanceof ComposerError) {
        fail(res, err.stderr.trim() || err.message, 400);
        return;
      }
      fail(res, (err as Error).message);
    }
  });

  router.put("/node/:id", async (req: Request, res: Response) => {
    const { id } = req.params;
    const body = req.body as {
      fields?: Partial<NodeFields>;
      localDirectives?: Directive[];
      referenceMd?: string;
    };

    try {
      const existing = await readNodeFiles(repoRoot, id);
      if (!existing) {
        fail(res, `Unknown node id: ${id}`, 404);
        return;
      }

      if (body.fields) {
        await writeNodeFields(repoRoot, id, body.fields);
      }
      if (body.localDirectives) {
        await writeLocalDirectives(repoRoot, id, body.localDirectives);
      }
      if (body.referenceMd !== undefined) {
        await writeProseFile(repoRoot, id, body.referenceMd);
      }

      // Persist the composed artifacts with the canonical (write) tokenizer, so
      // committed .composed/ stays consistent with the CI gate. Recompose the
      // edited node; if it's project/component (blast radius), recompose all.
      await composeWrite(repoRoot, id, writeTokenizer);
      if (existing.layer === "project" || existing.layer === "component") {
        await composeAll(repoRoot, writeTokenizer);
      }

      const refreshed = await readNodeFiles(repoRoot, id);
      // Live meter uses the display tokenizer (accurate; not persisted).
      const composed = await composeStdout(repoRoot, id, displayTokenizer);
      const detail: NodeDetail = {
        id,
        layer: refreshed!.layer,
        fields: refreshed!.fields,
        localDirectives: refreshed!.localDirectives,
        composed,
        referenceMd: refreshed!.referenceMd,
        proseFile: refreshed!.proseFile,
        corpus: refreshed!.corpus,
      };

      res.setHeader("X-Blast-Radius", blastRadius(existing.layer));
      ok(res, detail);
    } catch (err) {
      if (err instanceof ComposerError) {
        res.setHeader("X-Blast-Radius", "leaf");
        fail(res, err.stderr.trim() || err.message, 400);
        return;
      }
      fail(res, (err as Error).message);
    }
  });

  router.get("/budget", async (_req: Request, res: Response) => {
    try {
      const report = await budget(repoRoot, displayTokenizer, tokenBudget);
      ok(res, report);
    } catch (err) {
      if (err instanceof ComposerError) {
        fail(res, err.stderr.trim() || err.message, 400);
        return;
      }
      fail(res, (err as Error).message);
    }
  });

  router.post("/recompose", async (_req: Request, res: Response) => {
    try {
      const recomposed = await composeAll(repoRoot, writeTokenizer);
      ok(res, { recomposed });
    } catch (err) {
      if (err instanceof ComposerError) {
        fail(res, err.stderr.trim() || err.message, 400);
        return;
      }
      fail(res, (err as Error).message);
    }
  });

  // --- P3 (D10): per-node corpus + branch-scoped retrieval ---
  // Per tools/rag/CONTRACT.md §"Studio seam". Corpus edits do not commit
  // (same as P2 Save — the human commits); each write recomposes the edited
  // node so .composed/ reference lists stay fresh (composer._load_node_dir
  // reads corpus/manifest.yaml).

  router.get("/node/:id/corpus", async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const entries = await readCorpus(repoRoot, id);
      ok(res, { entries });
    } catch (err) {
      if (err instanceof CorpusError) {
        fail(res, err.message, err.status);
        return;
      }
      fail(res, (err as Error).message);
    }
  });

  router.post("/node/:id/corpus", async (req: Request, res: Response) => {
    const { id } = req.params;
    const body = req.body as {
      file?: string;
      content?: string;
      title?: string;
      source?: string;
      license?: string;
      lang?: Lang;
    };
    try {
      if (typeof body.file !== "string" || body.file.length === 0) {
        fail(res, "Missing required field: file", 400);
        return;
      }
      if (typeof body.content !== "string") {
        fail(res, "Missing required field: content", 400);
        return;
      }
      const entries = await addCorpusEntry(repoRoot, id, {
        file: body.file,
        content: body.content,
        title: body.title,
        source: body.source,
        license: body.license,
        lang: body.lang,
      });
      // Deliverables are always leaves, so the edited node itself is the
      // full blast radius here (no composeAll needed, unlike the P2 PUT).
      await composeWrite(repoRoot, id, writeTokenizer);
      ok(res, { entries });
    } catch (err) {
      if (err instanceof CorpusError) {
        fail(res, err.message, err.status);
        return;
      }
      if (err instanceof ComposerError) {
        fail(res, err.stderr.trim() || err.message, 400);
        return;
      }
      fail(res, (err as Error).message);
    }
  });

  router.get("/node/:id/corpus/:file", async (req: Request, res: Response) => {
    const { id, file } = req.params;
    try {
      const corpusFile = await readCorpusFile(repoRoot, id, file);
      ok(res, corpusFile);
    } catch (err) {
      if (err instanceof CorpusError) {
        fail(res, err.message, err.status);
        return;
      }
      fail(res, (err as Error).message);
    }
  });

  router.delete("/node/:id/corpus/:file", async (req: Request, res: Response) => {
    const { id, file } = req.params;
    try {
      const entries = await deleteCorpusEntry(repoRoot, id, file);
      await composeWrite(repoRoot, id, writeTokenizer);
      ok(res, { entries });
    } catch (err) {
      if (err instanceof CorpusError) {
        fail(res, err.message, err.status);
        return;
      }
      if (err instanceof ComposerError) {
        fail(res, err.stderr.trim() || err.message, 400);
        return;
      }
      fail(res, (err as Error).message);
    }
  });

  router.post("/node/:id/search", async (req: Request, res: Response) => {
    const { id } = req.params;
    const body = req.body as { text?: string; k?: number };
    try {
      if (typeof body.text !== "string" || body.text.trim().length === 0) {
        fail(res, "Missing required field: text", 400);
        return;
      }
      const k = Number.isFinite(body.k) && (body.k ?? 0) > 0 ? Math.floor(body.k as number) : 5;
      const outcome = await search(repoRoot, id, body.text, k, searchEmbedder);
      ok(res, outcome);
    } catch (err) {
      if (err instanceof RagError) {
        fail(res, err.stderr.trim() || err.message, 400);
        return;
      }
      fail(res, (err as Error).message);
    }
  });

  return router;
}

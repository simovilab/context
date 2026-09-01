// All HTTP endpoints from tools/studio/CONTRACT.md, using the
// { ok: true, data } | { ok: false, error } envelope throughout.

import { Router, type Request, type Response } from "express";
import { budget, composeAll, composeStdout, composeWrite, ComposerError } from "./composer.js";
import { readNodeFiles, readTree, writeLocalDirectives, writeNodeFields, writeProseFile } from "./store.js";
import type { ApiEnvelope, Directive, Layer, NodeDetail, NodeFields, Tokenizer } from "./types.js";

export interface StudioConfig {
  repoRoot: string;
  tokenBudget: number;
  // displayTokenizer drives the live meter/budget (accurate, e.g. tiktoken) and
  // is never persisted. writeTokenizer stamps the committed .composed/ artifacts
  // (canonical, offline-deterministic, matches the CI `compose --check` gate).
  displayTokenizer: Tokenizer;
  writeTokenizer: Tokenizer;
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
  const { repoRoot, tokenBudget, displayTokenizer, writeTokenizer } = config;

  router.get("/config", (_req: Request, res: Response) => {
    ok(res, { tokenBudget, tokenizer: displayTokenizer, repoRoot });
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

  return router;
}

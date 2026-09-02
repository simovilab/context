// Entry point: resolves the repo root, wires up the API router, and (in
// production) serves the built web app statically.

import express from "express";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverRepoRoot } from "./repo.js";
import { createRouter } from "./routes.js";
import type { SearchEmbedder, Tokenizer } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv: string[]): { repo?: string } {
  const out: { repo?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--repo" && argv[i + 1]) {
      out.repo = argv[i + 1];
      i++;
    }
  }
  return out;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = discoverRepoRoot(args.repo);

  const port = Number(process.env.PORT || process.env.STUDIO_PORT || 4317);
  const tokenBudget = Number(process.env.STUDIO_TOKEN_BUDGET || 4000);
  // Live meter/budget default to the accurate tiktoken proxy (override via
  // STUDIO_TOKENIZER=heuristic if the [tokenizers] extra isn't installed).
  // Committed .composed/ artifacts always use the offline-deterministic
  // heuristic, matching the CI `compose --check` gate.
  const displayTokenizer: Tokenizer = (process.env.STUDIO_TOKENIZER as Tokenizer) || "tiktoken";
  const writeTokenizer: Tokenizer = "heuristic";
  // Live retrieval search box embedder (D10 config split, tools/rag/CONTRACT.md).
  // rag.ts retries once with "hashing" per-request if "semantic" errors (e.g.
  // the [semantic] extra / model is absent), so this only picks the *first*
  // embedder tried, not a hard requirement.
  const rawSearchEmbedder = process.env.STUDIO_RAG_EMBEDDER;
  const searchEmbedder: SearchEmbedder =
    rawSearchEmbedder === "hashing" || rawSearchEmbedder === "semantic" ? rawSearchEmbedder : "semantic";

  const app = express();
  app.use(express.json({ limit: "5mb" }));

  app.use(
    "/api",
    createRouter({ repoRoot, tokenBudget, displayTokenizer, writeTokenizer, searchEmbedder }),
  );

  // Serve the built web app in production, if present. In dev, Vite runs the
  // web app on its own port and proxies /api to this server (see web/README).
  const webDist = resolve(__dirname, "../../web/dist");
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get("*", (_req, res) => {
      res.sendFile(join(webDist, "index.html"));
    });
  }

  app.listen(port, () => {
    console.log(`InfoTP Context Studio server listening on http://localhost:${port}`);
    console.log(`Repo root: ${repoRoot}`);
    console.log(
      `Tokenizer: ${displayTokenizer} (display) / ${writeTokenizer} (committed), token budget: ${tokenBudget}`,
    );
    console.log(`Search embedder: ${searchEmbedder} (falls back to hashing per-request on error)`);
    if (!existsSync(webDist)) {
      console.log("(web/dist not found — serving API only; run the web app separately in dev)");
    }
  });
}

main();

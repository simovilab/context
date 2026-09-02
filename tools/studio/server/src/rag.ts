// Thin wrapper around the Python RAG CLI (`python -m infotp_rag`), per
// tools/rag/CONTRACT.md §"Studio seam (Track C)". Mirrors composer.ts's
// child_process pattern exactly — this module shells out and parses
// stdout/stderr; it never reimplements chunking, embedding, or retrieval.

import { spawn } from "node:child_process";
import { resolvePythonBin } from "./python.js";
import type { RetrievedChunk, SearchEmbedder } from "./types.js";

export class RagError extends Error {
  constructor(
    message: string,
    public readonly stderr: string,
    public readonly exitCode: number | null,
  ) {
    super(message);
    this.name = "RagError";
  }
}

function runRag(repoRoot: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    // Same interpreter resolution as composer.ts (STUDIO_PYTHON, else a repo
    // .venv, else python3), so both CLIs run under the one venv that has
    // infotp_composer + infotp_rag installed.
    const child = spawn(resolvePythonBin(repoRoot), ["-m", "infotp_rag", ...args, "--repo", repoRoot], {
      cwd: repoRoot,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));

    child.on("error", (err) => {
      reject(new RagError(`Failed to spawn infotp_rag: ${err.message}`, "", null));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new RagError(
            `infotp_rag exited with code ${code}: ${stderr.trim() || "(no stderr)"}`,
            stderr,
            code,
          ),
        );
        return;
      }
      resolvePromise({ stdout, stderr });
    });
  });
}

interface RagQueryJson {
  ok: boolean;
  embedder: string;
  node_id: string;
  k: number;
  results: RetrievedChunk[];
}

/** `query <id> "text" -k <k> --embedder <embedder> --json` — parsed JSON only. */
async function queryOnce(
  repoRoot: string,
  id: string,
  text: string,
  k: number,
  embedder: SearchEmbedder,
): Promise<{ embedder: string; results: RetrievedChunk[] }> {
  const { stdout } = await runRag(repoRoot, [
    "query",
    id,
    text,
    "-k",
    String(k),
    "--embedder",
    embedder,
    "--json",
  ]);
  try {
    const parsed = JSON.parse(stdout) as RagQueryJson;
    return { embedder: parsed.embedder, results: parsed.results };
  } catch (err) {
    throw new RagError(
      `infotp_rag produced invalid JSON for query ${id}: ${(err as Error).message}`,
      stdout,
      0,
    );
  }
}

export interface SearchOutcome {
  embedder: string;
  results: RetrievedChunk[];
  // Additive beyond tools/rag/CONTRACT.md's { embedder, results } shape: true
  // when the requested "semantic" embedder failed (extra/model absent) and
  // this answer came from the "hashing" retry instead. Lets the web label
  // the result "hashing (fallback)" without re-deriving it from config.
  fallback: boolean;
}

/**
 * Branch-scoped query against a node's corpus (Store.parent_chain enforces
 * scoping inside infotp_rag — never reimplemented here). If `embedder` is
 * "semantic" and the query fails (sentence-transformers/model absent),
 * retry once with "hashing" and label the outcome as a fallback, per the
 * two-tokenizer-style config split in tools/rag/CONTRACT.md.
 */
export async function search(
  repoRoot: string,
  id: string,
  text: string,
  k: number,
  embedder: SearchEmbedder,
): Promise<SearchOutcome> {
  try {
    const result = await queryOnce(repoRoot, id, text, k, embedder);
    return { ...result, fallback: false };
  } catch (err) {
    if (embedder === "semantic" && err instanceof RagError) {
      const fallback = await queryOnce(repoRoot, id, text, k, "hashing");
      return { ...fallback, fallback: true };
    }
    throw err;
  }
}

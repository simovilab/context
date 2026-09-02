// Reads and writes a node's corpus/ directory: manifest.yaml (source of
// truth, schemas/corpus.schema.json) plus the .md/.txt text files it lists.
// Plain file IO only, mirroring store.ts — retrieval and chunking stay in
// infotp_rag (see rag.ts); recomposing after a write is the caller's job
// (routes.ts), same as the P2 PUT does.

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { corpusDir } from "./repo.js";
import { findNodeDir } from "./store.js";
import type { CorpusEntry, Lang } from "./types.js";

// Mirrors schemas/corpus.schema.json's entry.file pattern exactly.
const FILENAME_RE = /^[a-z0-9][a-z0-9._-]*\.[a-z0-9]+$/;
const ALLOWED_EXTENSIONS = new Set(["md", "txt"]);

export class CorpusError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "CorpusError";
  }
}

function manifestPath(nodeDir: string): string {
  return `${corpusDir(nodeDir)}/manifest.yaml`;
}

/** Reject path traversal, non-schema filenames, and unsupported (non .md/.txt) types. */
export function validateCorpusFilename(file: string): void {
  if (file.includes("/") || file.includes("\\") || file.includes("..")) {
    throw new CorpusError(`Invalid corpus filename: ${file}`);
  }
  if (!FILENAME_RE.test(file)) {
    throw new CorpusError(`Invalid corpus filename: ${file} (must match ${FILENAME_RE})`);
  }
  const ext = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new CorpusError(`Unsupported corpus file type: .${ext} (only .md/.txt in P3)`);
  }
}

async function readManifestEntries(nodeDir: string): Promise<CorpusEntry[]> {
  const path = manifestPath(nodeDir);
  if (!existsSync(path)) return [];
  const raw = await readFile(path, "utf-8");
  const data = (parseYaml(raw) ?? {}) as { entries?: CorpusEntry[] };
  return data.entries ?? [];
}

/** indentSeq:false matches the repo's block-sequence YAML style (see store.ts). */
async function writeManifestEntries(nodeDir: string, entries: CorpusEntry[]): Promise<void> {
  const dir = corpusDir(nodeDir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  await writeFile(manifestPath(nodeDir), stringifyYaml({ entries }, { indentSeq: false }), "utf-8");
}

export interface CorpusUpload {
  file: string;
  content: string;
  title?: string;
  source?: string;
  license?: string;
  lang?: Lang;
}

/** GET /api/node/:id/corpus */
export async function readCorpus(repoRoot: string, id: string): Promise<CorpusEntry[]> {
  const loc = await findNodeDir(repoRoot, id);
  if (!loc) throw new CorpusError(`Unknown node id: ${id}`, 404);
  return readManifestEntries(loc.dir);
}

/** POST /api/node/:id/corpus — deliverables only. Writes the file, then upserts its manifest entry. */
export async function addCorpusEntry(
  repoRoot: string,
  id: string,
  upload: CorpusUpload,
): Promise<CorpusEntry[]> {
  const loc = await findNodeDir(repoRoot, id);
  if (!loc) throw new CorpusError(`Unknown node id: ${id}`, 404);
  if (loc.layer !== "deliverable") {
    throw new CorpusError(`Corpus uploads are only allowed on deliverable nodes (${id} is ${loc.layer})`);
  }
  validateCorpusFilename(upload.file);

  const dir = corpusDir(loc.dir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  await writeFile(`${dir}/${upload.file}`, upload.content, "utf-8");

  const entry: CorpusEntry = {
    file: upload.file,
    ...(upload.title !== undefined ? { title: upload.title } : {}),
    ...(upload.source !== undefined ? { source: upload.source } : {}),
    ...(upload.license !== undefined ? { license: upload.license } : {}),
    ...(upload.lang !== undefined ? { lang: upload.lang } : {}),
  };

  const existingEntries = await readManifestEntries(loc.dir);
  const updated = [...existingEntries.filter((e) => e.file !== upload.file), entry];
  await writeManifestEntries(loc.dir, updated);
  return updated;
}

/** DELETE /api/node/:id/corpus/:file — removes the file (if present) + its manifest entry. */
export async function deleteCorpusEntry(
  repoRoot: string,
  id: string,
  file: string,
): Promise<CorpusEntry[]> {
  const loc = await findNodeDir(repoRoot, id);
  if (!loc) throw new CorpusError(`Unknown node id: ${id}`, 404);
  validateCorpusFilename(file);

  const filePath = `${corpusDir(loc.dir)}/${file}`;
  if (existsSync(filePath)) rmSync(filePath);

  const existingEntries = await readManifestEntries(loc.dir);
  const updated = existingEntries.filter((e) => e.file !== file);
  await writeManifestEntries(loc.dir, updated);
  return updated;
}

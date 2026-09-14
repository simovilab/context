// Reads and writes a node's corpus/ directory: manifest.yaml (source of
// truth, schemas/corpus.schema.json) plus the text/binary files it lists.
// Plain file IO only, mirroring store.ts — retrieval and chunking stay in
// infotp_rag (see rag.ts); recomposing after a write is the caller's job
// (routes.ts), same as the P2 PUT does.

import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { corpusDir } from "./repo.js";
import { findNodeDir } from "./store.js";
import type { CorpusEntry, Lang } from "./types.js";

// Mirrors schemas/corpus.schema.json's entry.file pattern exactly.
const FILENAME_RE = /^[a-z0-9][a-z0-9._-]*\.[a-z0-9]+$/;

// Upload allowlist (P4): text formats, PDF, images, and office documents.
// Keep in sync with tools/studio/CONTRACT.md, schemas/corpus.schema.json,
// and the web CorpusPanel's copy.
const TEXT_EXTENSIONS = ["md", "txt", "csv", "json", "yaml", "yml", "xml", "html"];
const BINARY_EXTENSIONS = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "docx",
  "xlsx",
  "pptx",
];
const ALLOWED_EXTENSIONS = new Set([...TEXT_EXTENSIONS, ...BINARY_EXTENSIONS]);

/** Hard cap on a single corpus upload (decoded bytes), per tools/studio/CONTRACT.md. */
export const MAX_CORPUS_BYTES = 10 * 1024 * 1024;

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

/**
 * Path-traversal + filename-shape guard shared by the text read/write path and
 * the raw-bytes read: rejects separators, "..", and anything outside the
 * schema's filename pattern (mirrors schemas/corpus.schema.json entry.file).
 */
function checkFilenameShape(file: string): void {
  if (file.includes("/") || file.includes("\\") || file.includes("..")) {
    throw new CorpusError(`Invalid corpus filename: ${file}`);
  }
  if (!FILENAME_RE.test(file)) {
    throw new CorpusError(`Invalid corpus filename: ${file} (must match ${FILENAME_RE})`);
  }
}

/** Reject path traversal, non-schema filenames, and types outside the upload allowlist. */
export function validateCorpusFilename(file: string): void {
  checkFilenameShape(file);
  const ext = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new CorpusError(
      `Unsupported corpus file type: .${ext} (allowed: ${[...ALLOWED_EXTENSIONS].sort().join(", ")})`,
    );
  }
}

/**
 * Normalize a client-supplied filename to the manifest's kebab-case shape:
 * lowercase, spaces/underscores → dashes, anything outside [a-z0-9.-]
 * stripped (path separators included), repeat dashes collapsed, and
 * leading/trailing dots+dashes trimmed. The extension (final ".ext")
 * survives. Identity for names that already validate; callers must still
 * run validateCorpusFilename afterwards so a name that sanitizes to nothing
 * usable (or a stripped traversal attempt) 400s instead of writing.
 */
export function sanitizeCorpusFilename(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
}

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/** Strict base64 decode — Buffer.from ignores invalid chars instead of failing. */
function decodeBase64(encoded: string): Buffer {
  const trimmed = encoded.trim();
  if (!BASE64_RE.test(trimmed) || trimmed.length % 4 !== 0) {
    throw new CorpusError(
      "Invalid contentB64: expected standard base64 bytes (with padding, no data-URL prefix)",
    );
  }
  return Buffer.from(trimmed, "base64");
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
  /** UTF-8 text of the document — mutually exclusive with contentB64. */
  content?: string;
  /** Standard base64 of the raw file bytes — mutually exclusive with content. */
  contentB64?: string;
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

/**
 * POST /api/node/:id/corpus — any layer (project/component corpus accumulates
 * down to every descendant, so those writes have branch-wide blast radius;
 * routes.ts recomposes all for non-leaves). Writes the file (text as UTF-8,
 * contentB64 binary-safely), then upserts its manifest entry. The incoming
 * filename is sanitized to kebab-case first (identity for names that already
 * validate); exactly one of content/contentB64 must be set.
 */
export async function addCorpusEntry(
  repoRoot: string,
  id: string,
  upload: CorpusUpload,
): Promise<CorpusEntry[]> {
  const loc = await findNodeDir(repoRoot, id);
  if (!loc) throw new CorpusError(`Unknown node id: ${id}`, 404);
  const file = sanitizeCorpusFilename(upload.file);
  validateCorpusFilename(file);

  const hasText = upload.content !== undefined;
  const hasB64 = upload.contentB64 !== undefined;
  if (hasText === hasB64) {
    throw new CorpusError(
      "Provide exactly one of content (UTF-8 text) or contentB64 (base64-encoded bytes)",
    );
  }
  const bytes = hasB64 ? decodeBase64(upload.contentB64!) : Buffer.from(upload.content!, "utf-8");
  if (bytes.byteLength > MAX_CORPUS_BYTES) {
    throw new CorpusError(
      `Corpus file exceeds the ${MAX_CORPUS_BYTES / (1024 * 1024)} MB cap ` +
        `(${bytes.byteLength} bytes; limit ${MAX_CORPUS_BYTES})`,
    );
  }

  const dir = corpusDir(loc.dir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  await writeFile(`${dir}/${file}`, bytes);

  const entry: CorpusEntry = {
    file,
    ...(upload.title !== undefined ? { title: upload.title } : {}),
    ...(upload.source !== undefined ? { source: upload.source } : {}),
    ...(upload.license !== undefined ? { license: upload.license } : {}),
    ...(upload.lang !== undefined ? { lang: upload.lang } : {}),
  };

  const existingEntries = await readManifestEntries(loc.dir);
  const updated = [...existingEntries.filter((e) => e.file !== file), entry];
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
  if (updated.length === 0 && dirHasOnlyManifest(corpusDir(loc.dir))) {
    // Last entry removed: drop the corpus dir entirely instead of leaving an
    // empty manifest.yaml behind (a later upload recreates it via mkdirSync).
    rmSync(corpusDir(loc.dir), { recursive: true, force: true });
    return updated;
  }
  await writeManifestEntries(loc.dir, updated);
  return updated;
}

/** True when the corpus dir holds nothing but its manifest (safe to remove). */
function dirHasOnlyManifest(dir: string): boolean {
  if (!existsSync(dir)) return false;
  return readdirSync(dir).every((name) => name === "manifest.yaml");
}

export interface CorpusFile {
  file: string;
  content: string;
  ext: string;
}

/** GET /api/node/:id/corpus/:file — read-only; reuses validateCorpusFilename as the traversal guard. */
export async function readCorpusFile(repoRoot: string, id: string, file: string): Promise<CorpusFile> {
  const loc = await findNodeDir(repoRoot, id);
  if (!loc) throw new CorpusError(`Unknown node id: ${id}`, 404);
  validateCorpusFilename(file);

  const filePath = `${corpusDir(loc.dir)}/${file}`;
  if (!existsSync(filePath)) {
    throw new CorpusError(`Corpus file not found: ${file}`, 404);
  }

  const content = await readFile(filePath, "utf-8");
  const ext = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
  return { file, content, ext };
}

// --- Raw-bytes read (multi-format corpus preview) ---
// Serves any extension with a sane Content-Type so the web app can point
// <img>/<iframe>/download links straight at it. Deliberately NOT restricted
// to ALLOWED_EXTENSIONS: the manifest schema allows any extension, and the
// JSON text read above remains the md/txt-friendly authoring surface.

/** Content-Type by lowercase extension; anything unmapped → application/octet-stream. */
const RAW_CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  json: "application/json; charset=utf-8",
  yaml: "application/yaml; charset=utf-8",
  yml: "application/yaml; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
};

export function rawCorpusContentType(ext: string): string {
  return RAW_CONTENT_TYPES[ext] ?? "application/octet-stream";
}

export interface RawCorpusFile {
  file: string;
  bytes: Buffer;
  contentType: string;
}

/**
 * GET /api/node/:id/corpus/:file/raw — read-only; same traversal guard as the
 * text read (checkFilenameShape) but without the upload-extension allowlist.
 */
export async function readCorpusFileRaw(repoRoot: string, id: string, file: string): Promise<RawCorpusFile> {
  const loc = await findNodeDir(repoRoot, id);
  if (!loc) throw new CorpusError(`Unknown node id: ${id}`, 404);
  checkFilenameShape(file);

  const filePath = `${corpusDir(loc.dir)}/${file}`;
  if (!existsSync(filePath)) {
    throw new CorpusError(`Corpus file not found: ${file}`, 404);
  }

  const bytes = await readFile(filePath);
  const ext = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
  return { file, bytes, contentType: rawCorpusContentType(ext) };
}

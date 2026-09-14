import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { deleteCorpusEntry, getCorpus, uploadCorpusEntry } from "./api";
import CorpusViewer from "./CorpusViewer";
import { LANGS } from "./types";
import type { CorpusEntry, Lang } from "./types";

function extOf(file: string): string {
  return file.slice(file.lastIndexOf(".") + 1).toLowerCase();
}

// Upload allowlist — mirrors server/src/corpus.ts and tools/studio/CONTRACT.md.
// Keep the three in sync.
const TEXT_EXTENSIONS = new Set(["md", "txt", "csv", "json", "yaml", "yml", "xml", "html"]);
const BINARY_EXTENSIONS = new Set([
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
]);
const ALLOWED_EXTENSIONS = new Set([...TEXT_EXTENSIONS, ...BINARY_EXTENSIONS]);
const ACCEPT_ATTR = [...ALLOWED_EXTENSIONS]
  .map((e) => `.${e}`)
  .join(",");
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Mirrors the server's sanitizeCorpusFilename: kebab-case, extension kept. */
function sanitizeFilename(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
}

/** Read a binary File as standard base64 (data-URL prefix stripped). */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string" || !result.includes(",")) {
        reject(new Error("Could not read file as base64"));
        return;
      }
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface CorpusPanelProps {
  nodeId: string;
}

interface Draft {
  file: string;
  title: string;
  source: string;
  license: string;
  lang: Lang;
  /** Manual paste or a picked text file (sent as `content`). */
  content: string;
  /** A picked binary file as standard base64 (sent as `contentB64`). */
  contentB64?: string;
  /** Size in bytes of the picked disk file, for display. */
  pickedSize?: number;
}

function emptyDraft(): Draft {
  return { file: "", title: "", source: "", license: "", lang: "en", content: "" };
}

export default function CorpusPanel({ nodeId }: CorpusPanelProps) {
  const [entries, setEntries] = useState<CorpusEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [uploading, setUploading] = useState(false);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setError(null);
    setLoading(true);
    setDraft(emptyDraft());
    setOpenFile(null);
    getCorpus(nodeId)
      .then((r) => setEntries(r.entries))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load corpus"))
      .finally(() => setLoading(false));
  }, [nodeId]);

  async function handleUpload() {
    setUploading(true);
    setError(null);
    try {
      const { entries: next } = await uploadCorpusEntry(nodeId, {
        file: draft.file.trim(),
        ...(draft.contentB64 !== undefined
          ? { contentB64: draft.contentB64 }
          : { content: draft.content }),
        title: draft.title.trim() || undefined,
        source: draft.source.trim() || undefined,
        license: draft.license.trim() || undefined,
        lang: draft.lang,
      });
      setEntries(next);
      setDraft(emptyDraft());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  /** "Upload from disk…": text formats are loaded into the content textarea
   * (still editable); binary formats are kept as base64 and uploaded as-is. */
  async function handlePick(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (!picked) return;
    setError(null);

    const ext = extOf(picked.name);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      setError(
        `Unsupported file type: .${ext || "(none)"} — allowed: ${[...ALLOWED_EXTENSIONS].sort().join(", ")}`,
      );
      return;
    }
    if (picked.size > MAX_UPLOAD_BYTES) {
      setError(`"${picked.name}" is ${formatBytes(picked.size)} — the limit is 10 MB per file.`);
      return;
    }

    try {
      const name = sanitizeFilename(picked.name);
      if (TEXT_EXTENSIONS.has(ext)) {
        const text = await picked.text();
        setDraft((d) => ({
          ...d,
          file: name || d.file,
          content: text,
          contentB64: undefined,
          pickedSize: picked.size,
        }));
      } else {
        const contentB64 = await readFileAsBase64(picked);
        setDraft((d) => ({
          ...d,
          file: name || d.file,
          content: "",
          contentB64,
          pickedSize: picked.size,
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the picked file");
    }
  }

  async function handleDelete(file: string) {
    setError(null);
    try {
      const { entries: next } = await deleteCorpusEntry(nodeId, file);
      setEntries(next);
      setOpenFile((current) => (current === file ? null : current));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  function toggleView(file: string) {
    setOpenFile((current) => (current === file ? null : file));
  }

  return (
    <div>
      <div className="section-title">Corpus</div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="empty-state">Loading corpus…</div>}
      {!loading && entries.length === 0 && <div className="empty-state">No corpus entries.</div>}
      {entries.map((e) => (
        <div className="corpus-entry" key={e.file}>
          <div className="corpus-entry-head">
            <span className="mono">{e.file}</span>
            <div className="corpus-entry-actions">
              <button onClick={() => toggleView(e.file)} title={`View ${e.file}`}>
                {openFile === e.file ? "Hide" : "View"}
              </button>
              <button onClick={() => handleDelete(e.file)} title={`Delete ${e.file}`}>
                Delete
              </button>
            </div>
          </div>
          <div className="notice">
            {e.title ?? "(no title)"}
            {e.source ? ` · ${e.source}` : ""}
            {e.license ? ` · ${e.license}` : ""}
            {e.lang ? ` · ${e.lang}` : ""}
          </div>
          {openFile === e.file && <CorpusViewer nodeId={nodeId} file={e.file} ext={extOf(e.file)} />}
        </div>
      ))}

      <>
          <div className="section-title">Add corpus document</div>
          <div className="field-row">
            <label>upload from disk</label>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <input
                ref={fileInputRef}
                type="file"
                hidden
                accept={ACCEPT_ATTR}
                onChange={handlePick}
              />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                Choose file…
              </button>
              {draft.pickedSize !== undefined && (
                <>
                  <span className="notice">
                    {draft.contentB64 !== undefined ? "binary file" : "text"} ·{" "}
                    {formatBytes(draft.pickedSize)} ·{" "}
                    {draft.contentB64 !== undefined ? "uploaded as-is" : "editable below"}
                  </span>
                  <button onClick={() => setDraft(emptyDraft())} disabled={uploading}>
                    Clear
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="field-row">
            <label>filename (kebab-case; sanitized on upload)</label>
            <input
              type="text"
              value={draft.file}
              onChange={(e) => setDraft((d) => ({ ...d, file: e.target.value }))}
              placeholder="gtfs-schedule-core-files.md"
            />
          </div>
          <div className="field-row">
            <label>title</label>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            />
          </div>
          <div className="field-row">
            <label>source (provenance)</label>
            <input
              type="text"
              value={draft.source}
              onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value }))}
              placeholder="citation or origin, never an internal URL"
            />
          </div>
          <div className="field-row">
            <label>license</label>
            <input
              type="text"
              value={draft.license}
              onChange={(e) => setDraft((d) => ({ ...d, license: e.target.value }))}
              placeholder="CC-BY-4.0, public-domain, internal…"
            />
          </div>
          <div className="field-row">
            <label>lang</label>
            <select value={draft.lang} onChange={(e) => setDraft((d) => ({ ...d, lang: e.target.value as Lang }))}>
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="field-row">
            <label>content</label>
            <textarea
              rows={8}
              value={draft.content}
              disabled={draft.contentB64 !== undefined}
              placeholder={
                draft.contentB64 !== undefined
                  ? "binary file loaded — its bytes will be uploaded as-is"
                  : ""
              }
              onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
            />
          </div>
          <button
            className="primary"
            onClick={handleUpload}
            disabled={
              uploading || !draft.file.trim() || (draft.contentB64 === undefined && !draft.content.trim())
            }
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
          <div className="notice">
            Formats: md, txt, csv, json, yaml, yml, xml, html, pdf, png, jpg, jpeg, gif, svg, webp,
            docx, xlsx, pptx · max 10 MB per file.
          </div>
          <div className="notice">Corpus edits do not commit — the human commits in git yourself.</div>
      </>
    </div>
  );
}

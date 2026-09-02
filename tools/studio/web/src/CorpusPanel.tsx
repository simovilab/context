import { useEffect, useState } from "react";
import { deleteCorpusEntry, getCorpus, uploadCorpusEntry } from "./api";
import { LANGS } from "./types";
import type { CorpusEntry, Lang, Layer } from "./types";

interface CorpusPanelProps {
  nodeId: string;
  layer: Layer;
}

interface Draft {
  file: string;
  title: string;
  source: string;
  license: string;
  lang: Lang;
  content: string;
}

function emptyDraft(): Draft {
  return { file: "", title: "", source: "", license: "", lang: "en", content: "" };
}

export default function CorpusPanel({ nodeId, layer }: CorpusPanelProps) {
  const [entries, setEntries] = useState<CorpusEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setError(null);
    setLoading(true);
    setDraft(emptyDraft());
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
        content: draft.content,
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

  async function handleDelete(file: string) {
    setError(null);
    try {
      const { entries: next } = await deleteCorpusEntry(nodeId, file);
      setEntries(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
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
            {layer === "deliverable" && (
              <button onClick={() => handleDelete(e.file)} title={`Delete ${e.file}`}>
                Delete
              </button>
            )}
          </div>
          <div className="notice">
            {e.title ?? "(no title)"}
            {e.source ? ` · ${e.source}` : ""}
            {e.license ? ` · ${e.license}` : ""}
            {e.lang ? ` · ${e.lang}` : ""}
          </div>
        </div>
      ))}

      {layer === "deliverable" && (
        <>
          <div className="section-title">Add corpus document</div>
          <div className="field-row">
            <label>filename (kebab-case, .md/.txt)</label>
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
              onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
            />
          </div>
          <button
            className="primary"
            onClick={handleUpload}
            disabled={uploading || !draft.file.trim() || !draft.content.trim()}
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
          <div className="notice">Corpus edits do not commit — the human commits in git yourself.</div>
        </>
      )}
    </div>
  );
}

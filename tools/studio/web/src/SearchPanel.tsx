import { useState } from "react";
import { searchNode } from "./api";
import MarkdownPreview, { ViewToggle, type ViewMode } from "./MarkdownPreview";
import type { RetrievedChunk } from "./types";

interface SearchPanelProps {
  nodeId: string;
}

export default function SearchPanel({ nodeId }: SearchPanelProps) {
  const [text, setText] = useState("");
  const [k, setK] = useState(5);
  const [results, setResults] = useState<RetrievedChunk[]>([]);
  const [embedder, setEmbedder] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  // Per-chunk Rendered/Raw mode for chunks from .md corpus files (markdown
  // fragments). Defaults to raw — chunks are mid-document fragments.
  const [chunkModes, setChunkModes] = useState<Record<string, ViewMode>>({});

  async function handleSearch() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await searchNode(nodeId, trimmed, k);
      setResults(res.results);
      setEmbedder(res.embedder);
      setFallback(res.fallback);
      setSearched(true);
    } catch (e) {
      setResults([]);
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="section-title">Retrieval search</div>
      <div className="field-row">
        <label>query</label>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSearch();
          }}
          placeholder="service alerts"
        />
      </div>
      <div className="field-row">
        <label>k</label>
        <input
          type="number"
          min={1}
          max={20}
          value={k}
          onChange={(e) => setK(Math.max(1, Number(e.target.value) || 5))}
        />
      </div>
      <button className="primary" onClick={handleSearch} disabled={loading || !text.trim()}>
        {loading ? "Searching…" : "Search"}
      </button>

      {error && <div className="error-banner">{error}</div>}
      {embedder && (
        <div className="notice">
          Answered by: {embedder}
          {fallback ? " (fallback)" : ""}
        </div>
      )}

      {searched && results.length === 0 && !error && <div className="empty-state">No results.</div>}

      {results.map((r, i) => {
        const chunkKey = `${r.node_id}/${r.file}#${r.ordinal}`;
        const isMdChunk = r.file.toLowerCase().endsWith(".md");
        const mode = chunkModes[chunkKey] ?? "raw";
        return (
          <div className="search-result" key={`${chunkKey}-${i}`}>
            <div className="search-result-head">
              <span className="pill">{r.score.toFixed(3)}</span>
              <span className="tag mono">
                {r.node_id} · {r.file}
              </span>
              {r.title && <span className="notice">{r.title}</span>}
              {isMdChunk && (
                <ViewToggle
                  mode={mode}
                  onChange={(m) => setChunkModes((prev) => ({ ...prev, [chunkKey]: m }))}
                />
              )}
            </div>
            <div className="search-result-text">
              {isMdChunk && mode === "rendered" ? (
                <MarkdownPreview className="bare">{r.text}</MarkdownPreview>
              ) : (
                r.text
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

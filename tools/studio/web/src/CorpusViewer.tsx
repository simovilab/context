import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getCorpusFile } from "./api";

interface CorpusViewerProps {
  nodeId: string;
  file: string;
  ext: string;
}

type ViewMode = "rendered" | "raw";

export default function CorpusViewer({ nodeId, file, ext }: CorpusViewerProps) {
  const isMarkdown = ext === "md";
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>(isMarkdown ? "rendered" : "raw");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent(null);
    getCorpusFile(nodeId, file)
      .then((r) => {
        if (!cancelled) setContent(r.content);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load file");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nodeId, file]);

  if (loading) return <div className="empty-state">Loading {file}…</div>;
  if (error) return <div className="error-banner">{error}</div>;
  if (content === null) return null;

  return (
    <div className="corpus-viewer">
      {isMarkdown && (
        <div className="view-toggle">
          <button className={mode === "rendered" ? "active" : ""} onClick={() => setMode("rendered")}>
            Rendered
          </button>
          <button className={mode === "raw" ? "active" : ""} onClick={() => setMode("raw")}>
            Raw
          </button>
        </div>
      )}
      {!isMarkdown && <div className="view-toggle-label notice">Plain text (.{ext}) — raw view</div>}
      {isMarkdown && mode === "rendered" ? (
        <div className="md-view">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      ) : (
        <pre className="mono corpus-raw">{content}</pre>
      )}
    </div>
  );
}

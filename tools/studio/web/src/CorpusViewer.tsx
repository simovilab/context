// Format-aware corpus file viewer. Text formats (.md via the JSON endpoint,
// other text via the raw endpoint's text body) are fetched and displayed;
// binary formats (pdf/images/office docs) never touch the JSON endpoint —
// they point <img>/<iframe>/<a download> straight at the raw-bytes URL.

import { useEffect, useState, type ReactNode } from "react";
import { getCorpusFile } from "./api";
import MarkdownPreview, { ViewToggle, type ViewMode } from "./MarkdownPreview";

interface CorpusViewerProps {
  nodeId: string;
  file: string;
  ext: string;
}

type CorpusFormat = "markdown" | "csv" | "text-source" | "pdf" | "image" | "other";

const TEXT_SOURCE_EXTS = new Set(["txt", "json", "yaml", "yml", "xml", "html", "htm"]);
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);

function classify(ext: string): CorpusFormat {
  if (ext === "md") return "markdown";
  if (ext === "csv") return "csv";
  if (TEXT_SOURCE_EXTS.has(ext)) return "text-source";
  if (ext === "pdf") return "pdf";
  if (IMAGE_EXTS.has(ext)) return "image";
  return "other";
}

/** Raw-bytes URL (GET /api/node/:id/corpus/:file/raw — no envelope, see CONTRACT.md). */
function rawCorpusUrl(nodeId: string, file: string): string {
  return `/api/node/${encodeURIComponent(nodeId)}/corpus/${encodeURIComponent(file)}/raw`;
}

/** Naive CSV split: lines on \r?\n, cells on commas, first row is the header. */
function parseCsv(content: string): string[][] {
  return content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => line.split(","));
}

function CsvTable({ content }: { content: string }) {
  const rows = parseCsv(content);
  if (rows.length === 0) return <div className="empty-state">Empty CSV.</div>;
  const [header, ...bodyRows] = rows;
  return (
    <div className="md-view csv-view">
      <table>
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th key={i}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, i) => (
                <td key={i}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CorpusViewer({ nodeId, file, ext }: CorpusViewerProps) {
  const format = classify(ext);
  // Only these formats fetch a text body; markdown keeps the JSON endpoint.
  const fetchesText = format === "markdown" || format === "csv" || format === "text-source";
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>(format === "markdown" || format === "csv" ? "rendered" : "raw");
  const rawUrl = rawCorpusUrl(nodeId, file);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent(null);
    setMode(format === "markdown" || format === "csv" ? "rendered" : "raw");
    if (!fetchesText) {
      // Binary/unknown formats render straight from the raw URL — nothing to fetch.
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    const load: Promise<string> =
      format === "markdown"
        ? getCorpusFile(nodeId, file).then((r) => r.content)
        : fetch(rawUrl).then(async (res) => {
            if (!res.ok) throw new Error(`Failed to load file (${res.status})`);
            return res.text();
          });
    load
      .then((text) => {
        if (!cancelled) setContent(text);
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
  }, [nodeId, file, format, fetchesText, rawUrl]);

  if (loading) return <div className="empty-state">Loading {file}…</div>;
  if (error) return <div className="error-banner">{error}</div>;

  let body: ReactNode;
  if (format === "markdown" || format === "csv") {
    body =
      mode === "rendered" ? (
        format === "markdown" ? (
          <MarkdownPreview>{content ?? ""}</MarkdownPreview>
        ) : (
          <CsvTable content={content ?? ""} />
        )
      ) : (
        <pre className="mono corpus-raw">{content}</pre>
      );
  } else if (format === "text-source") {
    // Always show source, never render (esp. HTML/XML) — React escapes the pre content.
    body = (
      <>
        <div className="view-toggle-label notice">Source (.{ext})</div>
        <pre className="mono corpus-raw">{content}</pre>
      </>
    );
  } else if (format === "pdf") {
    body = (
      <>
        <iframe className="corpus-pdf" src={rawUrl} title={file} />
        <div className="notice">
          <a href={rawUrl} target="_blank" rel="noreferrer">
            Open {file} in a new tab
          </a>
        </div>
      </>
    );
  } else if (format === "image") {
    body = <img className="corpus-image" src={rawUrl} alt={file} />;
  } else {
    body = (
      <div className="view-toggle-label notice">
        No inline preview for .{ext} —{" "}
        <a href={rawUrl} download={file}>
          download {file}
        </a>
      </div>
    );
  }

  return (
    <div className="corpus-viewer">
      {(format === "markdown" || format === "csv") && <ViewToggle mode={mode} onChange={setMode} />}
      {body}
    </div>
  );
}

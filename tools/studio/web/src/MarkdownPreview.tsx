// Shared rendered-markdown block + the Rendered/Raw toggle used wherever a
// markdown-ish surface can be viewed both ways (corpus .md files, prose
// preview, retrieval chunks). react-markdown never renders raw HTML, so this
// is XSS-safe for untrusted corpus content.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type ViewMode = "rendered" | "raw";

interface MarkdownPreviewProps {
  children: string;
  /** Extra class(es) for the wrapper, e.g. "bare" to drop the card styling. */
  className?: string;
}

/** GitHub-style rendered markdown (styles in styles.css under .md-view). */
export default function MarkdownPreview({ children, className }: MarkdownPreviewProps) {
  return (
    <div className={className ? `md-view ${className}` : "md-view"}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

interface ViewToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  /** Labels for the two buttons (defaults: Rendered / Raw). */
  labels?: [string, string];
  /** Mode each button maps to; pair with labels when the rendered mode is not
   *  the first button (e.g. prose Edit / Preview). */
  values?: [ViewMode, ViewMode];
}

/** The two-button Rendered/Raw switch (shared .view-toggle styles). */
export function ViewToggle({
  mode,
  onChange,
  labels = ["Rendered", "Raw"],
  values = ["rendered", "raw"],
}: ViewToggleProps) {
  return (
    <div className="view-toggle">
      {labels.map((label, i) => (
        <button key={label} className={mode === values[i] ? "active" : ""} onClick={() => onChange(values[i])}>
          {label}
        </button>
      ))}
    </div>
  );
}

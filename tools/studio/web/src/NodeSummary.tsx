import type { NodeDetail } from "./types";

interface NodeSummaryProps {
  node: NodeDetail;
}

export default function NodeSummary({ node }: NodeSummaryProps) {
  const { fields, composed, localDirectives, corpus } = node;

  return (
    <div className="node-summary">
      <div className="node-summary-name">{fields.name}</div>
      <div className="node-summary-idline mono">
        {fields.id} · {node.layer}
      </div>

      <div className="node-summary-row">
        <span className={`pill status-${fields.status}`}>{fields.status}</span>
        {fields.kind.map((k) => (
          <span key={k} className="tag">
            {k}
          </span>
        ))}
        {fields.hito && <span className="tag">hito {fields.hito}</span>}
        {fields.due_month !== undefined && <span className="tag">due M{fields.due_month}</span>}
      </div>

      {composed.chain.length > 0 && (
        <div className="node-summary-chain mono">{composed.chain.join(" → ")}</div>
      )}

      <div className="node-summary-grid">
        <div className="node-summary-field">
          <span className="node-summary-label">owner</span>
          <span className="node-summary-value">
            {fields.owner.length > 0 ? fields.owner.join(", ") : "—"}
          </span>
        </div>
        <div className="node-summary-field">
          <span className="node-summary-label">depends_on</span>
          <span className="node-summary-value">
            {fields.depends_on.length > 0 ? fields.depends_on.join(", ") : "—"}
          </span>
        </div>
        {fields.result && (
          <div className="node-summary-field">
            <span className="node-summary-label">result</span>
            <span className="node-summary-value">
              {fields.result.type || "—"} ({fields.result.visibility})
            </span>
          </div>
        )}
      </div>

      <div className="node-summary-counts">
        <span>
          effective directives <strong>{composed.directives.length}</strong>{" "}
          <span className="text-muted">
            (~{composed.token_estimate.directives} tok) + reference{" "}
            <strong>{composed.token_estimate.reference}</strong> tok ={" "}
            <strong>{composed.token_estimate.total}</strong> tok (
            {composed.token_estimate.method})
          </span>
        </span>
        <span>
          local directives <strong>{localDirectives.length}</strong>
        </span>
        <span>
          corpus files <strong>{corpus.length}</strong>
        </span>
        <span>
          reference docs <strong>{composed.reference.length}</strong>
        </span>
      </div>
    </div>
  );
}

import type { ComposedView } from "./types";
import TokenMeter from "./TokenMeter";

interface ComposedPanelProps {
  composed: ComposedView;
  tokenBudget: number;
}

export default function ComposedPanel({ composed, tokenBudget }: ComposedPanelProps) {
  return (
    <div>
      <div className="section-title">Token estimate</div>
      <TokenMeter
        tokens={composed.token_estimate.total}
        budget={tokenBudget}
        method={`${composed.token_estimate.method} — directives + reference`}
      />

      <div className="section-title">Effective directives</div>
      {composed.directives.length === 0 && <div className="empty-state">No effective directives.</div>}
      {composed.directives.map((d) => (
        <div className="composed-directive" key={d.key}>
          <div className="key">{d.key}</div>
          <div className="text">{d.text}</div>
          <div className="from">from: {d.sources.join(" → ")}</div>
        </div>
      ))}

      <div className="section-title">Reference corpus</div>
      {composed.reference.length === 0 ? (
        <div className="empty-state">None yet.</div>
      ) : (
        <ul>
          {composed.reference.map((r) => (
            <li key={r.path} className="mono">
              {r.file} <span className="notice">({r.source})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

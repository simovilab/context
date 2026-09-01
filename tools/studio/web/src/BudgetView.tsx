import type { BudgetResponse } from "./types";

interface BudgetViewProps {
  budget: BudgetResponse | null;
  loading: boolean;
  error: string | null;
}

export default function BudgetView({ budget, loading, error }: BudgetViewProps) {
  if (loading) return <div className="empty-state">Loading budget…</div>;
  if (error) return <div className="error-banner">{error}</div>;
  if (!budget) return <div className="empty-state">No budget data.</div>;

  const overflowSet = new Set(budget.overflows);

  return (
    <div>
      <p className="notice">
        Per-branch worst-case-leaf guardrail (D9): each component's row shows the single deepest/heaviest
        leaf under it, compared against the token budget — not an average or a sum.
      </p>
      <table className="budget-table">
        <thead>
          <tr>
            <th>Component</th>
            <th>Worst-case leaf</th>
            <th>Tokens</th>
            <th>Budget</th>
          </tr>
        </thead>
        <tbody>
          {budget.components.map((row) => {
            const overflow = overflowSet.has(row.worstLeaf.id);
            return (
              <tr key={row.component} className={overflow ? "overflow" : ""}>
                <td className="mono">{row.component}</td>
                <td className="mono">{row.worstLeaf.id}</td>
                <td className="mono">{row.worstLeaf.tokens}</td>
                <td className="mono">{budget.tokenBudget}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

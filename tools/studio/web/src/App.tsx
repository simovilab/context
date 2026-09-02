import { useCallback, useEffect, useState } from "react";
import { getBudget, getConfig, getNode, getTree } from "./api";
import BudgetView from "./BudgetView";
import ComposedPanel from "./ComposedPanel";
import InfoPanel from "./InfoPanel";
import NodeEditor from "./NodeEditor";
import TokenMeter from "./TokenMeter";
import TreeBrowser from "./TreeBrowser";
import type { BudgetResponse, ConfigResponse, NodeDetail, TreeResponse } from "./types";

type Tab = "authoring" | "budget" | "info";

export default function App() {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [tree, setTree] = useState<TreeResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [node, setNode] = useState<NodeDetail | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [nodeError, setNodeError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("authoring");
  const [budget, setBudget] = useState<BudgetResponse | null>(null);
  const [budgetLoading, setBudgetLoading] = useState(false);
  const [budgetError, setBudgetError] = useState<string | null>(null);

  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch((e) => setTreeError(e instanceof Error ? e.message : "Failed to load config"));
    getTree()
      .then(setTree)
      .catch((e) => setTreeError(e instanceof Error ? e.message : "Failed to load tree"));
  }, []);

  const loadNode = useCallback((id: string) => {
    setSelectedId(id);
    setNodeError(null);
    getNode(id)
      .then(setNode)
      .catch((e) => {
        setNode(null);
        setNodeError(e instanceof Error ? e.message : "Failed to load node");
      });
  }, []);

  function handleSaved(updated: NodeDetail) {
    setNode(updated);
    // Refresh the tree in case fields that affect the tree view (status, kind, name) changed.
    getTree()
      .then(setTree)
      .catch(() => {
        /* non-fatal: tree refresh best-effort */
      });
  }

  function loadBudget() {
    setBudgetLoading(true);
    setBudgetError(null);
    getBudget()
      .then(setBudget)
      .catch((e) => setBudgetError(e instanceof Error ? e.message : "Failed to load budget"))
      .finally(() => setBudgetLoading(false));
  }

  useEffect(() => {
    if (tab === "budget" && !budget && !budgetLoading) {
      loadBudget();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <div className="app">
      <div className="topbar">
        <h1>InfoTP Context Studio</h1>
        <div className="app-note">
          Local, single-user. Save writes the working tree only — commit changes in git yourself.
        </div>
      </div>
      <div className="tabbar">
        <button className={tab === "authoring" ? "active" : ""} onClick={() => setTab("authoring")}>
          Authoring
        </button>
        <button className={tab === "budget" ? "active" : ""} onClick={() => setTab("budget")}>
          Budget
        </button>
        <button className={tab === "info" ? "active" : ""} onClick={() => setTab("info")}>
          Info
        </button>
      </div>

      {tab === "info" ? (
        <div className="pane" style={{ borderRight: "none", padding: 0 }}>
          <InfoPanel />
        </div>
      ) : tab === "authoring" ? (
        <div className="panes">
          <div className="pane">
            {treeError && <div className="error-banner">{treeError}</div>}
            {tree && (
              <TreeBrowser
                nodes={tree.nodes}
                roots={tree.roots}
                selectedId={selectedId}
                onSelect={loadNode}
              />
            )}
          </div>
          <div className="pane">
            {nodeError && <div className="error-banner">{nodeError}</div>}
            {!node && !nodeError && <div className="empty-state">Select a node from the tree.</div>}
            {node && <NodeEditor node={node} onSaved={handleSaved} />}
          </div>
          <div className="pane">
            {node && config && <ComposedPanel composed={node.composed} tokenBudget={config.tokenBudget} />}
            {node && !config && (
              <TokenMeter
                tokens={node.composed.token_estimate.directives}
                budget={4000}
                method={node.composed.token_estimate.method}
              />
            )}
            {!node && <div className="empty-state">Composed view appears here.</div>}
          </div>
        </div>
      ) : (
        <div className="pane" style={{ borderRight: "none", padding: 16 }}>
          <BudgetView budget={budget} loading={budgetLoading} error={budgetError} />
        </div>
      )}
    </div>
  );
}

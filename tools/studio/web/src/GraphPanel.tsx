import { useMemo } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node as FlowNode,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { TreeNode } from "./types";
import { shortName } from "./shortNames";

interface GraphPanelProps {
  nodes: TreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  "not-started": "#9ca3af",
  "in-progress": "#2563eb",
  blocked: "#d97706",
  done: "#16a34a",
};

const NODE_WIDTH = 176;
const NODE_HEIGHT = 60;

type GraphNodeData = {
  id: string;
  label: string;
  layer: TreeNode["layer"];
  status: string;
  kinds: string[];
  hito?: string;
  due_month?: number;
  deps: string[];
  selected: boolean;
  onSelect: (id: string) => void;
};

function GraphNodeCard({ data }: NodeProps) {
  const d = data as unknown as GraphNodeData;
  const color = STATUS_COLORS[d.status] ?? "#9ca3af";
  const depth = d.layer === "project" ? 0 : d.layer === "component" ? 1 : 2;
  return (
    <div
      className={`graph-node graph-node-${d.layer}${d.selected ? " selected" : ""}`}
      style={{ borderColor: color, paddingLeft: 6 + depth * 4 }}
      onClick={() => d.onSelect(d.id)}
      title={`${d.id} — ${d.status}${d.kinds.length ? ` · ${d.kinds.join("/")}` : ""}`}
    >
      {/* React Flow anchors edges on Handles; without them no edge renders. */}
      <Handle type="target" position={Position.Top} className="graph-handle" isConnectable={false} />
      <Handle type="source" position={Position.Bottom} className="graph-handle" isConnectable={false} />
      <div className="graph-node-row">
        <span className="graph-node-id">{d.id}</span>
        <span className="graph-node-name">{d.label}</span>
        <span className="graph-node-dot" style={{ background: color }} />
      </div>
      <div className="graph-node-meta">
        {d.kinds.length > 0 && <span className="graph-chip">{d.kinds.join("·")}</span>}
        {d.hito && (
          <span className="graph-chip">
            H{d.hito}
            {d.due_month !== undefined ? ` · M${d.due_month}` : ""}
          </span>
        )}
        {d.deps.length > 0 && (
          <span className="graph-chip graph-chip-dep" title={`depends on ${d.deps.join(", ")}`}>
            ← {d.deps.length}
          </span>
        )}
      </div>
    </div>
  );
}

const nodeTypes = { graph: GraphNodeCard };

/** Position the tree for readability: project centered on top, each component
 * a column, its deliverables stacked beneath it. Wide, shallow, and zoomable —
 * fits the store's actual shape (7 components, ≤5 deliverables each) far
 * better than a generic DAG ranking, which squeezes 23 leaves into one rank. */
function layout(
  nodes: TreeNode[],
  selectedId: string | null,
  onSelect: (id: string) => void
) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const project = nodes.find((n) => n.layer === "project") ?? null;
  const components = nodes
    .filter((n) => n.layer === "component")
    .sort((a, b) => a.id.localeCompare(b.id));
  const childrenOf = new Map<string, TreeNode[]>();
  for (const n of nodes) {
    if (n.layer === "deliverable") {
      const key = n.component ?? n.parent ?? "";
      const list = childrenOf.get(key) ?? [];
      list.push(n);
      childrenOf.set(key, list);
    }
  }

  const COL_GAP = 48;
  const ROW_GAP = 28;
  const positions = new Map<string, { x: number; y: number }>();

  // Column x-offsets; each column is NODE_WIDTH wide.
  let x = 0;
  for (const comp of components) {
    positions.set(comp.id, { x, y: 0 });
    const kids = (childrenOf.get(comp.id) ?? []).sort((a, b) => a.id.localeCompare(b.id));
    kids.forEach((kid, i) => {
      positions.set(kid.id, { x, y: NODE_HEIGHT + ROW_GAP + i * (NODE_HEIGHT + ROW_GAP) });
    });
    x += NODE_WIDTH + COL_GAP;
  }
  const totalWidth = Math.max(x - COL_GAP, NODE_WIDTH);
  if (project) {
    positions.set(project.id, { x: (totalWidth - NODE_WIDTH) / 2, y: -(NODE_HEIGHT + ROW_GAP) });
  }

  const flowNodes: FlowNode[] = nodes
    .filter((n) => positions.has(n.id))
    .map((n) => ({
      id: n.id,
      type: "graph",
      position: positions.get(n.id)!,
      data: {
        id: n.id,
        label: shortName(n.id, n.name),
        layer: n.layer,
        status: n.status,
        kinds: n.kind,
        hito: n.hito,
        due_month: n.due_month,
        deps: n.depends_on.filter((dep) => dep !== n.id && byId.has(dep)),
        selected: n.id === selectedId,
        onSelect,
      } as unknown as Record<string, unknown>,
      draggable: true,
    }));

  const edges: Edge[] = [];
  for (const n of nodes) {
    for (const childId of n.children) {
      if (childId !== n.id && byId.has(childId) && positions.has(childId)) {
        edges.push({
          id: `h:${n.id}->${childId}`,
          source: n.id,
          target: childId,
          type: "smoothstep",
        });
      }
    }
  }
  for (const n of nodes) {
    for (const dep of n.depends_on) {
      if (dep !== n.id && byId.has(dep) && positions.has(dep)) {
        edges.push({
          id: `d:${n.id}->${dep}`,
          source: n.id,
          target: dep,
          type: "smoothstep",
          animated: n.id === selectedId || dep === selectedId,
          markerEnd: { type: "arrowclosed" },
          style: { strokeDasharray: "5 3" },
        });
      }
    }
  }

  return { flowNodes, edges };
}

export default function GraphPanel({ nodes, selectedId, onSelect }: GraphPanelProps) {
  const { flowNodes, edges } = useMemo(
    () => layout(nodes, selectedId, onSelect),
    [nodes, selectedId, onSelect]
  );

  return (
    <div className="graph-wrap">
      <div className="graph-legend">
        {Object.keys(STATUS_COLORS).map((s) => (
          <span key={s} className="graph-legend-item">
            <span className="graph-node-dot" style={{ background: STATUS_COLORS[s] }} />
            {s}
          </span>
        ))}
        <span className="graph-legend-item">
          <svg width="22" height="6">
            <line x1="0" y1="3" x2="22" y2="3" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          hierarchy
        </span>
        <span className="graph-legend-item">
          <svg width="22" height="6">
            <line
              x1="0"
              y1="3"
              x2="22"
              y2="3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="5 3"
            />
          </svg>
          depends_on
        </span>
        <span className="graph-legend-item">chips: kind · hito/month · ← deps</span>
        <span className="graph-legend-hint">click a node to open it in Authoring</span>
      </div>
      <div className="graph-canvas">
        <ReactFlow
          nodes={flowNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}

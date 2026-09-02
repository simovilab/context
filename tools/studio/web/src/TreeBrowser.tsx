import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { TreeNode } from "./types";

interface TreeBrowserProps {
  nodes: TreeNode[];
  roots: string[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function StatusDot({ status }: { status: string }) {
  return <span className={`status-dot status-${status}`} title={status} />;
}

function Row({
  node,
  depth,
  expanded,
  hasChildren,
  onToggle,
  onSelect,
  selected,
}: {
  node: TreeNode;
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  onToggle: () => void;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <div
      className={`tree-node${selected ? " selected" : ""}`}
      style={{ paddingLeft: 4 + depth * 14 }}
      onClick={onSelect}
    >
      <span
        className="tree-toggle"
        onClick={(e) => {
          e.stopPropagation();
          if (hasChildren) onToggle();
        }}
      >
        {hasChildren ? (expanded ? "▾" : "▸") : ""}
      </span>
      <span className="id">{node.id}</span>
      <span className="name" title={node.name}>
        {node.name}
      </span>
      <StatusDot status={node.status} />
    </div>
  );
}

export default function TreeBrowser({ nodes, roots, selectedId, onSelect }: TreeBrowserProps) {
  const byId = useMemo(() => {
    const map = new Map<string, TreeNode>();
    for (const n of nodes) map.set(n.id, n);
    return map;
  }, [nodes]);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(roots));

  function toggle(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderNode(id: string, depth: number): ReactNode[] {
    const node = byId.get(id);
    if (!node) return [];
    const expanded = expandedIds.has(id);
    const hasChildren = node.children.length > 0;
    const out: ReactNode[] = [
      <Row
        key={id}
        node={node}
        depth={depth}
        expanded={expanded}
        hasChildren={hasChildren}
        selected={id === selectedId}
        onToggle={() => toggle(id)}
        onSelect={() => onSelect(id)}
      />,
    ];
    if (expanded) {
      for (const childId of node.children) {
        out.push(...renderNode(childId, depth + 1));
      }
    }
    return out;
  }

  if (nodes.length === 0) {
    return <div className="empty-state">No nodes loaded yet.</div>;
  }

  return <div>{roots.flatMap((r) => renderNode(r, 0))}</div>;
}

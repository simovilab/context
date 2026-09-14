"""Store-wide graph rendering: the whole node DAG as a Mermaid diagram.

Emitted as ``.composed/graph.mmd`` alongside the per-node artifacts — a
generated, git-diffable snapshot (D4) that renders anywhere Mermaid does
(e.g. GitHub markdown). Components become subgraphs (the hierarchy);
``depends_on`` edges are dashed arrows; node color encodes status, using
the same palette idea as the Studio's status dots.
"""

from __future__ import annotations

from typing import Dict, List

from .model import Node, Store

# Mermaid classDef colors per status — light fills that print/preview well.
_STATUS_CLASSES = {
    "not-started": "fill:#e5e7eb,stroke:#9ca3af",
    "in-progress": "fill:#dbeafe,stroke:#2563eb",
    "blocked": "fill:#fef3c7,stroke:#d97706",
    "done": "fill:#dcfce7,stroke:#16a34a",
}


def to_mermaid(store: Store) -> str:
    """Render the full store (hierarchy + depends_on edges) as Mermaid."""

    def label(node: Node) -> str:
        return f"{node.id}<br/>{_esc(node.name)}"

    def _esc(text: str) -> str:
        # Mermaid node labels are HTML-ish; quotes and angle brackets must go.
        return (
            text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
        )

    lines: List[str] = ["graph TD"]

    project = next((n for n in store.nodes.values() if n.layer == "project"), None)
    if project is not None:
        lines.append(f"  {project.id}[\"{label(project)}\"]")

    components = sorted(
        (n for n in store.nodes.values() if n.layer == "component"), key=lambda n: n.id
    )
    deliverables_by_component: Dict[str, List[Node]] = {}
    for node in store.nodes.values():
        if node.layer == "deliverable":
            deliverables_by_component.setdefault(node.component or "", []).append(node)

    for comp in components:
        lines.append(f"  subgraph {comp.id}[\"{_esc(comp.name)}\"]")
        for d in sorted(deliverables_by_component.get(comp.id, []), key=lambda n: n.id):
            lines.append(f"    {d.id}[\"{label(d)}\"]")
        lines.append("  end")

    # Hierarchy edges: project -> each component (solid, subtle).
    for comp in components:
        if project is not None:
            lines.append(f"  {project.id} --- {comp.id}")

    # Dependency edges: dashed arrows, only those that resolve to known nodes.
    for node_id in sorted(store.nodes.keys()):
        node = store.nodes[node_id]
        for dep in node.depends_on:
            if dep in store.nodes:
                lines.append(f"  {node_id} -.-> {dep}")

    lines.append("  classDef not-started fill:#e5e7eb,stroke:#9ca3af")
    lines.append("  classDef in-progress fill:#dbeafe,stroke:#2563eb")
    lines.append("  classDef blocked fill:#fef3c7,stroke:#d97706")
    lines.append("  classDef done fill:#dcfce7,stroke:#16a34a")
    for status, class_spec in _STATUS_CLASSES.items():
        ids = sorted(n.id for n in store.nodes.values() if n.status == status)
        if ids:
            lines.append(f"  class {','.join(ids)} {status}")

    # Legend so the diagram reads standalone: one swatch per status.
    lines.append("  subgraph legend[\"status legend\"]")
    lines.append("    L1[\"not-started\"]:::not-started")
    lines.append("    L2[\"in-progress\"]:::in-progress")
    lines.append("    L3[\"blocked\"]:::blocked")
    lines.append("    L4[\"done\"]:::done")
    lines.append("  end")
    lines.append("  style legend fill:transparent,stroke:none")

    return "\n".join(lines) + "\n"

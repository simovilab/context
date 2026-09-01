"""Per-branch worst-case-leaf budget report (D9).

For each component, we compose every deliverable leaf beneath it and report
the leaf with the highest directive token count — the worst case a reader of
that branch could encounter. Separately, we scan every node in the store
(project, components, deliverables) and flag any whose own composed
directive token count exceeds the budget.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

from .compose import compose
from .model import Store
from .tokens import Tokenizer


@dataclass
class WorstLeaf:
    """The highest-token deliverable leaf found under one component."""

    id: str
    tokens: int


@dataclass
class ComponentBudget:
    """One component's worst-case-leaf entry in the budget report."""

    component: str
    worst_leaf: Optional[WorstLeaf]


@dataclass
class BudgetReport:
    """The full budget report: per-component worst leaves plus overflows."""

    token_budget: int
    components: List[ComponentBudget]
    overflows: List[str]


def _deliverables_for_component(store: Store, component_id: str) -> List[str]:
    leaves = []
    for node in store.nodes.values():
        if node.layer != "deliverable":
            continue
        if node.component == component_id:
            leaves.append(node.id)
        elif node.component is None and node.id.startswith(component_id) and node.id[len(component_id):].startswith("P"):
            leaves.append(node.id)
    return sorted(leaves)


def compute_budget(store: Store, tokenizer: Tokenizer, token_budget: int) -> BudgetReport:
    """Build the budget report for the whole store."""
    component_ids = sorted(
        node_id for node_id, node in store.nodes.items() if node.layer == "component"
    )

    components: List[ComponentBudget] = []
    for component_id in component_ids:
        leaf_ids = _deliverables_for_component(store, component_id)
        worst: Optional[WorstLeaf] = None
        for leaf_id in leaf_ids:
            composed = compose(store, leaf_id, tokenizer=tokenizer)
            tokens = int(composed.token_estimate["directives"])
            if worst is None or tokens > worst.tokens:
                worst = WorstLeaf(id=leaf_id, tokens=tokens)
        components.append(ComponentBudget(component=component_id, worst_leaf=worst))

    overflows: List[str] = []
    for node_id in sorted(store.nodes.keys()):
        composed = compose(store, node_id, tokenizer=tokenizer)
        tokens = int(composed.token_estimate["directives"])
        if tokens > token_budget:
            overflows.append(node_id)

    return BudgetReport(token_budget=token_budget, components=components, overflows=overflows)


def budget_to_json(report: BudgetReport) -> Dict[str, object]:
    """Render a BudgetReport into the exact dict shape from CONTRACT.md."""
    return {
        "tokenBudget": report.token_budget,
        "components": [
            {
                "component": c.component,
                "worstLeaf": (
                    {"id": c.worst_leaf.id, "tokens": c.worst_leaf.tokens}
                    if c.worst_leaf is not None
                    else None
                ),
            }
            for c in report.components
        ],
        "overflows": list(report.overflows),
    }

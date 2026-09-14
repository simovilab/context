from pathlib import Path

from infotp_composer.graph import to_mermaid
from infotp_composer.model import Node, Store

FIXTURES = Path(__file__).parent / "fixtures"


def test_to_mermaid_renders_hierarchy_and_dependencies():
    store = Store.load(FIXTURES)
    mmd = to_mermaid(store)

    assert mmd.startswith("graph TD")
    # Hierarchy: project root and component subgraphs.
    assert "project[" in mmd
    assert "subgraph C1[" in mmd
    # Deliverables appear inside their component subgraphs.
    assert "C1P1[" in mmd


def test_to_mermaid_is_deterministic():
    store = Store.load(FIXTURES)
    assert to_mermaid(store) == to_mermaid(store)


def _mini_store(**node_kwargs) -> Store:
    defaults = dict(
        id="X1",
        name="Node one",
        kind=["docs"],
        depends_on=[],
        layer="deliverable",
        status="not-started",
    )
    defaults.update(node_kwargs)
    node = Node(**defaults)
    return Store(nodes={node.id: node}, repo_root=FIXTURES)


def test_to_mermaid_renders_dependency_edges_for_known_targets_only():
    store = _mini_store(id="X2", depends_on=["X1"])
    store.nodes["X1"] = Node(
        id="X1", name="Node one", kind=["docs"], layer="deliverable", depends_on=[]
    )
    store.nodes["X3"] = Node(
        id="X3", name="Node three", kind=["docs"], layer="deliverable", depends_on=["MISSING"]
    )
    mmd = to_mermaid(store)

    assert "X2 -.-> X1" in mmd  # resolvable edge is rendered
    assert "MISSING" not in mmd  # dangling ID reference is skipped


def test_to_mermaid_escapes_html_ish_characters_in_names():
    node = Node(
        id="X1",
        name='Component <"A & B">',
        owner=[],
        kind=["docs"],
        depends_on=[],
        layer="component",
        status="not-started",
    )
    store = Store(nodes={"X1": node}, repo_root=FIXTURES)
    mmd = to_mermaid(store)

    assert "<" not in mmd.replace("&lt;", "")
    assert "&quot;" in mmd
    assert "&amp;" in mmd

from pathlib import Path

from infotp_composer.compose import ComposedNode
from infotp_composer.compose import compose
from infotp_composer.model import Store
from infotp_composer.render import to_json, to_markdown

FIXTURES = Path(__file__).parent / "fixtures"


def test_to_json_has_expected_keys_and_is_deterministic_besides_timestamp():
    store = Store.load(FIXTURES)
    composed = compose(store, "C1P1")
    a = to_json(composed)
    b = to_json(composed)

    assert set(a.keys()) == {
        "id",
        "name",
        "component",
        "kind",
        "status",
        "owner",
        "result",
        "depends_on",
        "hito",
        "due_month",
        "chain",
        "composed_at",
        "directives",
        "reference",
        "token_estimate",
    }
    a_no_ts = {k: v for k, v in a.items() if k != "composed_at"}
    b_no_ts = {k: v for k, v in b.items() if k != "composed_at"}
    assert a_no_ts == b_no_ts


def test_to_markdown_contains_expected_sections():
    store = Store.load(FIXTURES)
    composed = compose(store, "C1P1")
    md = to_markdown(composed)

    assert md.startswith("# `Software Deliverable` (`C1P1`)")
    assert "## Directives (composed)" in md
    assert "## Reference corpus" in md
    assert "do not hand-edit (D4)" in md
    assert "_from:" in md


def test_to_markdown_metadata_line_with_hito_due_month_and_result():
    node = ComposedNode(
        id="C4P3",
        name="Interfaz",
        component="C4",
        kind=["software", "api"],
        status="not-started",
        owner=["RH3", "RH5"],
        result={"type": "api", "visibility": "internal"},
        depends_on=["C4P1"],
        hito="E",
        due_month=13,
        chain=["project", "C4", "C4P3"],
        directives=[],
        reference=[],
        token_estimate={"directives": 0, "method": "heuristic-chars/4"},
    )
    md = to_markdown(node)
    assert "Hito E / month 13" in md
    assert "api (internal)" in md
    assert "RH3, RH5" in md


def test_to_markdown_empty_directives_and_reference_say_none_yet():
    empty = ComposedNode(
        id="EMPTY",
        name="Empty Node",
        component=None,
        kind=["software"],
        status="not-started",
        owner=[],
        result=None,
        depends_on=[],
        hito=None,
        due_month=None,
        chain=["project", "EMPTY"],
        directives=[],
        reference=[],
        token_estimate={"directives": 0, "method": "heuristic-chars/4"},
    )
    md = to_markdown(empty)
    assert "None yet." in md
    assert md.count("None yet.") == 2

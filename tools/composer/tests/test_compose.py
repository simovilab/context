from pathlib import Path

import pytest

from infotp_composer.compose import compose
from infotp_composer.model import CompositionError, Store

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture()
def store() -> Store:
    return Store.load(FIXTURES)


def _by_key(composed, key):
    for d in composed.directives:
        if d.key == key:
            return d
    return None


def test_set_at_project_is_inherited_by_leaf(store):
    composed = compose(store, "C1P2")
    d = _by_key(composed, "governance.rule")
    assert d is not None
    assert "Governance rule declared at the project layer" in d.text
    assert d.sources == ["project"]


def test_deeper_set_overrides_shallower_for_same_key(store):
    composed = compose(store, "C1P1")
    d = _by_key(composed, "common.greeting")
    assert d is not None
    assert d.text == "Say hello (component)."
    assert d.sources == ["C1"]


def test_extend_appends_and_lists_both_sources(store):
    composed = compose(store, "C1P1")
    d = _by_key(composed, "common.extend-me")
    assert d is not None
    assert "base text" in d.text
    assert "component addition" in d.text
    assert d.text == "base text\n\ncomponent addition"
    assert d.sources == ["project", "C1"]


def test_suppress_removes_inherited_directive(store):
    composed = compose(store, "C1P1")
    assert _by_key(composed, "temp.rule") is None

    # sibling with a different kind (docs) never touched by the suppression
    # at C1P1, so it still inherits the project's set.
    sibling = compose(store, "C1P2")
    d = _by_key(sibling, "temp.rule")
    assert d is not None
    assert d.text == "temp text"


def test_kind_filtering_absent_for_non_matching_present_for_matching(store):
    software_leaf = compose(store, "C1P1")
    docs_leaf = compose(store, "C1P2")

    assert _by_key(software_leaf, "docs.only-rule") is None
    d = _by_key(docs_leaf, "docs.only-rule")
    assert d is not None
    assert d.text == "A rule that only applies to docs-kind nodes."


def test_reference_accumulates_up_the_chain_unfiltered(store):
    composed = compose(store, "C1P1")
    files = {(r.file, r.source) for r in composed.reference}
    assert ("project-overview.md", "project") in files
    assert ("component-spec.md", "C1") in files
    assert ("deliverable-notes.md", "C1P1") in files
    assert len(composed.reference) == 3

    # sibling with no corpus of its own still gets the ancestors' union
    docs_leaf = compose(store, "C1P2")
    files = {(r.file, r.source) for r in docs_leaf.reference}
    assert ("project-overview.md", "project") in files
    assert ("component-spec.md", "C1") in files
    assert len(docs_leaf.reference) == 2


def test_reference_paths_are_repo_relative(store):
    composed = compose(store, "C1P1")
    r = next(r for r in composed.reference if r.file == "component-spec.md")
    assert r.path == "components/C1/corpus/component-spec.md"


def test_provenance_sources_ordered(store):
    composed = compose(store, "C1P1")
    d = _by_key(composed, "common.extend-me")
    assert d.sources == ["project", "C1"]


def test_deterministic_key_ordering(store):
    composed = compose(store, "C1P1")
    keys = [d.key for d in composed.directives]
    assert keys == sorted(keys)


def test_token_estimate_is_positive_int_with_heuristic_method(store):
    composed = compose(store, "C1P1")
    assert isinstance(composed.token_estimate["directives"], int)
    assert composed.token_estimate["directives"] > 0
    assert composed.token_estimate["method"] == "heuristic-chars/4"


def test_inline_node_directive_is_included(store):
    composed = compose(store, "C1P1")
    d = _by_key(composed, "leaf.extra")
    assert d is not None
    assert d.text == "Inline leaf-only directive."


def test_chain_for_project(store):
    composed = compose(store, "project")
    assert composed.chain == ["project"]


def test_chain_for_component(store):
    composed = compose(store, "C1")
    assert composed.chain == ["project", "C1"]


def test_chain_for_deliverable(store):
    composed = compose(store, "C1P1")
    assert composed.chain == ["project", "C1", "C1P1"]


def test_unknown_node_raises(store):
    with pytest.raises(CompositionError):
        compose(store, "DOES-NOT-EXIST")

import warnings
from pathlib import Path

from infotp_composer.model import Store

from infotp_rag.embedders import HashingEmbedder
from infotp_rag.retriever import DefaultRetriever

FIXTURES = Path(__file__).parent / "fixtures"


def _store() -> Store:
    return Store.load(FIXTURES)


def test_index_all_produces_stats_and_writes_rag_dir(tmp_path):
    import shutil

    shutil.copytree(FIXTURES, tmp_path, dirs_exist_ok=True)
    store = Store.load(tmp_path)
    retriever = DefaultRetriever()

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # unsupported-manual.pdf skip warning
        stats = retriever.index(store, None)

    assert stats.embedder == "hashing"
    assert stats.dim == 512
    assert stats.node_count == len(store.nodes)
    assert stats.chunk_count > 0
    assert (tmp_path / ".rag" / "index.npz").exists()
    assert (tmp_path / ".rag" / "index.chunks.json").exists()


def test_index_single_node_covers_only_its_parent_chain(tmp_path):
    import shutil

    shutil.copytree(FIXTURES, tmp_path, dirs_exist_ok=True)
    store = Store.load(tmp_path)
    retriever = DefaultRetriever()

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        stats = retriever.index(store, "C1P1")

    # parent_chain(C1P1) = [project, C1, C1P1]
    assert stats.node_count == 3


def test_unsupported_file_type_is_skipped_with_warning(tmp_path):
    import shutil

    shutil.copytree(FIXTURES, tmp_path, dirs_exist_ok=True)
    store = Store.load(tmp_path)
    retriever = DefaultRetriever()

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        retriever.index(store, "C1P1")

    messages = [str(w.message) for w in caught]
    assert any("unsupported-manual.pdf" in m for m in messages)


def test_query_is_branch_scoped_excludes_sibling(tmp_path):
    import shutil

    shutil.copytree(FIXTURES, tmp_path, dirs_exist_ok=True)
    store = Store.load(tmp_path)
    retriever = DefaultRetriever()

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        retriever.index(store, None)

    # C1P2's corpus mentions "fare collection hardware" and "warranty terms".
    results = retriever.query(store, "C1P1", "fare collection hardware warranty terms", k=10)
    returned_node_ids = {r.chunk.node_id for r in results}

    assert "C1P2" not in returned_node_ids
    assert "C2P1" not in returned_node_ids


def test_query_is_branch_scoped_excludes_other_component(tmp_path):
    import shutil

    shutil.copytree(FIXTURES, tmp_path, dirs_exist_ok=True)
    store = Store.load(tmp_path)
    retriever = DefaultRetriever()

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        retriever.index(store, None)

    results = retriever.query(store, "C1P1", "other branch reference", k=10)
    returned_node_ids = {r.chunk.node_id for r in results}
    assert "C2P1" not in returned_node_ids


def test_query_includes_ancestor_corpus():
    store = _store()
    retriever = DefaultRetriever()

    # No persisted index: query() must build in-memory on demand.
    results = retriever.query(store, "C1P1", "public transport information gtfs", k=10)
    returned_node_ids = {r.chunk.node_id for r in results}

    # C1 (the component, an ancestor of C1P1) owns component-shared.md and
    # must be reachable from a C1P1 query; C1P1 itself owns the GTFS doc.
    assert "C1" in returned_node_ids or "C1P1" in returned_node_ids


def test_query_own_sibling_cannot_see_c1p1_notes():
    store = _store()
    retriever = DefaultRetriever()

    results = retriever.query(store, "C1P2", "deliverable-local notes belongs only to C1P1", k=10)
    returned_node_ids = {r.chunk.node_id for r in results}
    assert "C1P1" not in returned_node_ids


def test_query_returns_no_more_than_k():
    store = _store()
    retriever = DefaultRetriever()
    results = retriever.query(store, "C1P1", "gtfs realtime feed", k=1)
    assert len(results) <= 1


def test_index_reuses_hashing_embedder_by_default():
    retriever = DefaultRetriever()
    assert isinstance(retriever.embedder, HashingEmbedder)

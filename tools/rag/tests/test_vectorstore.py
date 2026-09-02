import numpy as np
import pytest

from infotp_rag.types import Chunk
from infotp_rag.vectorstore import NumpyStore


def _chunk(node_id: str, ordinal: int = 0) -> Chunk:
    return Chunk(text=f"text-{node_id}-{ordinal}", node_id=node_id, file="f.md", title=None, ordinal=ordinal)


def test_add_and_search_masks_disallowed_nodes():
    store = NumpyStore(dim=4)
    vectors = np.array(
        [
            [1.0, 0.0, 0.0, 0.0],
            [0.0, 1.0, 0.0, 0.0],
        ],
        dtype=np.float32,
    )
    chunks = [_chunk("A"), _chunk("B")]
    store.add(vectors, chunks)

    query = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    results = store.search(query, k=5, allowed_nodes={"A"})

    assert len(results) == 1
    assert results[0].chunk.node_id == "A"
    assert results[0].score == pytest.approx(1.0)


def test_search_empty_store_returns_empty():
    store = NumpyStore(dim=4)
    results = store.search(np.zeros(4, dtype=np.float32), k=5, allowed_nodes={"A"})
    assert results == []


def test_search_respects_k():
    store = NumpyStore(dim=2)
    vectors = np.array([[1.0, 0.0], [0.9, 0.1], [0.0, 1.0]], dtype=np.float32)
    chunks = [_chunk("A", 0), _chunk("A", 1), _chunk("A", 2)]
    store.add(vectors, chunks)

    results = store.search(np.array([1.0, 0.0], dtype=np.float32), k=2, allowed_nodes={"A"})
    assert len(results) == 2
    assert results[0].score >= results[1].score


def test_add_mismatched_lengths_raises():
    store = NumpyStore(dim=4)
    with pytest.raises(ValueError):
        store.add(np.zeros((2, 4), dtype=np.float32), [_chunk("A")])


def test_add_empty_is_noop():
    store = NumpyStore(dim=4)
    store.add(np.zeros((0, 4), dtype=np.float32), [])
    assert store.chunks == []


def test_save_and_load_round_trip(tmp_path):
    store = NumpyStore(dim=3, embedder_name="hashing")
    vectors = np.array([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]], dtype=np.float32)
    chunks = [_chunk("A", 0), _chunk("B", 0)]
    store.add(vectors, chunks)

    path = tmp_path / ".rag" / "index.npz"
    store.save(path)

    assert path.exists()
    sidecar = tmp_path / ".rag" / "index.chunks.json"
    assert sidecar.exists()

    loaded = NumpyStore.load(path)
    assert loaded.dim == 3
    assert loaded.embedder_name == "hashing"
    assert len(loaded.chunks) == 2
    assert loaded.chunks[0].node_id == "A"
    assert np.allclose(loaded.vectors, store.vectors)

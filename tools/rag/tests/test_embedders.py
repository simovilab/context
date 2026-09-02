import numpy as np
import pytest

from infotp_rag.embedders import (
    HashingEmbedder,
    default_embedder,
    get_embedder,
)


def test_hashing_embedder_shape_and_normalization():
    embedder = HashingEmbedder()
    vectors = embedder.embed(["public transport information", "fare collection hardware"])

    assert vectors.shape == (2, 512)
    norms = np.linalg.norm(vectors, axis=1)
    for norm in norms:
        assert norm == pytest.approx(1.0, abs=1e-5)


def test_hashing_embedder_is_deterministic_across_instances():
    a = HashingEmbedder().embed(["deterministic text please"])
    b = HashingEmbedder().embed(["deterministic text please"])
    assert np.allclose(a, b)


def test_hashing_embedder_different_text_different_vector():
    embedder = HashingEmbedder()
    a, b = embedder.embed(["gtfs realtime vehicle positions", "warranty terms for hardware"])
    assert not np.allclose(a, b)


def test_hashing_embedder_empty_text_is_zero_vector():
    embedder = HashingEmbedder()
    vectors = embedder.embed([""])
    assert np.allclose(vectors, 0.0)


def test_hashing_embedder_custom_dim():
    embedder = HashingEmbedder(dim=64)
    vectors = embedder.embed(["hello world"])
    assert vectors.shape == (1, 64)


def test_get_embedder_hashing():
    embedder = get_embedder("hashing")
    assert embedder.name == "hashing"
    assert embedder.dim == 512


def test_get_embedder_unknown_raises():
    with pytest.raises(ValueError):
        get_embedder("nonexistent-backend")


def test_default_embedder_is_hashing():
    embedder = default_embedder()
    assert isinstance(embedder, HashingEmbedder)


def test_get_embedder_semantic_without_extra_raises_import_error(monkeypatch):
    import builtins

    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "sentence_transformers":
            raise ImportError("no sentence_transformers in this env")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)

    with pytest.raises(ImportError):
        get_embedder("semantic")

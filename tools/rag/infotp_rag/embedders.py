"""Swappable role 1: the embedding model (D10).

Ships one CI-safe, zero-network default (`HashingEmbedder`) and one optional,
lazily-imported local backend (`SentenceTransformerEmbedder`) behind a single
`Embedder` protocol and `get_embedder` factory — mirroring the tokenizer
factory pattern in infotp_composer.tokens.
"""

from __future__ import annotations

import hashlib
import os
import re
from typing import List, Optional, Protocol, runtime_checkable

import numpy as np

DEFAULT_HASHING_DIM = 512
DEFAULT_SEMANTIC_MODEL = "intfloat/multilingual-e5-small"

_TOKEN_RE = re.compile(r"[^\W_]+", re.UNICODE)


@runtime_checkable
class Embedder(Protocol):
    """Protocol for anything that can embed a batch of texts."""

    name: str
    dim: int

    def embed(self, texts: List[str]) -> np.ndarray:
        """Return an (len(texts), dim) array, L2-normalized rows."""
        ...


def _l2_normalize_rows(vectors: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    safe_norms = np.where(norms == 0, 1.0, norms)
    return vectors / safe_norms


def _token_hash_index(token: str, dim: int) -> int:
    digest = hashlib.sha256(token.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big") % dim


def _token_hash_sign(token: str) -> float:
    digest = hashlib.sha256((token + "|sign").encode("utf-8")).digest()
    return 1.0 if digest[0] % 2 == 0 else -1.0


class HashingEmbedder:
    """Deterministic bag-of-hashed-tokens embedder. Pure numpy + stdlib.

    No model, no network, no randomness across processes (uses sha256, not
    Python's salted `hash()`). CI/reproducibility default, mirroring
    `HeuristicTokenizer` (D9).
    """

    name = "hashing"

    def __init__(self, dim: int = DEFAULT_HASHING_DIM) -> None:
        self.dim = dim

    def embed(self, texts: List[str]) -> np.ndarray:
        vectors = np.zeros((len(texts), self.dim), dtype=np.float64)
        for row, text in enumerate(texts):
            for token in _TOKEN_RE.findall(text.lower()):
                idx = _token_hash_index(token, self.dim)
                vectors[row, idx] += _token_hash_sign(token)
        return _l2_normalize_rows(vectors).astype(np.float32)


class SentenceTransformerEmbedder:
    """Local sentence-transformers backend (optional `[semantic]` extra).

    Lazily imports `sentence_transformers` so the base package works without
    it installed. Default model is small, strong, and multilingual (the
    corpus is en+es); overridable via `INFOTP_RAG_MODEL`. Mirrors
    `TiktokenTokenizer` (D9): downloaded once to the local HF cache, no
    request-time network.
    """

    def __init__(self, model_name: Optional[str] = None) -> None:
        resolved_model = model_name or os.environ.get("INFOTP_RAG_MODEL", DEFAULT_SEMANTIC_MODEL)
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:
            raise ImportError(
                "sentence-transformers is required for SentenceTransformerEmbedder. "
                'Install it with: pip install "infotp_rag[semantic]"'
            ) from exc

        self._model = SentenceTransformer(resolved_model)
        self.name = f"st:{resolved_model}"
        self.dim = int(self._model.get_sentence_embedding_dimension())

    def embed(self, texts: List[str]) -> np.ndarray:
        vectors = self._model.encode(list(texts), normalize_embeddings=True)
        return np.asarray(vectors, dtype=np.float32)


def get_embedder(name: str = "hashing") -> Embedder:
    """Factory: resolve an embedder by short name.

    "hashing" -> HashingEmbedder, "semantic" -> SentenceTransformerEmbedder
    with the default model, "st:<model>" -> SentenceTransformerEmbedder with
    that specific model. Raises ValueError for any other name.
    """
    if name == "hashing":
        return HashingEmbedder()
    if name == "semantic":
        return SentenceTransformerEmbedder()
    if name.startswith("st:"):
        return SentenceTransformerEmbedder(model_name=name[len("st:") :])
    raise ValueError(f"Unknown embedder: {name!r}")


def default_embedder() -> Embedder:
    """Return the default embedder used when none is supplied."""
    return HashingEmbedder()

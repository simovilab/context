"""Swappable role 2: the vector store (D10).

`NumpyStore` is a flat matrix + parallel `list[Chunk]`; cosine similarity via
dot product on L2-normalized vectors; `search` masks rows whose owning node
is outside `allowed_nodes` before ranking, enforcing branch scoping at the
storage layer as a defense-in-depth measure (the retriever also computes and
passes `allowed_nodes` explicitly).
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import List, Optional, Protocol, Set, runtime_checkable

import numpy as np

from .types import Chunk, RetrievedChunk

_CHUNKS_SUFFIX = ".chunks.json"


def _chunks_sidecar_path(path: Path) -> Path:
    stem = path.name.rsplit(".", 1)[0] if "." in path.name else path.name
    return path.with_name(stem + _CHUNKS_SUFFIX)


@runtime_checkable
class VectorStore(Protocol):
    """Protocol for anything that can store and search chunk vectors."""

    def add(self, vectors: np.ndarray, chunks: List[Chunk]) -> None: ...

    def search(self, query: np.ndarray, k: int, allowed_nodes: Set[str]) -> List[RetrievedChunk]: ...

    def save(self, path: Path) -> None: ...

    @classmethod
    def load(cls, path: Path) -> "VectorStore": ...


@dataclass
class NumpyStore:
    """Flat in-memory vector index backed by a single .npz + JSON sidecar."""

    dim: int
    embedder_name: str = ""
    vectors: np.ndarray = field(default_factory=lambda: np.zeros((0, 0), dtype=np.float32))
    chunks: List[Chunk] = field(default_factory=list)

    def __post_init__(self) -> None:
        if self.vectors.size == 0:
            self.vectors = np.zeros((0, self.dim), dtype=np.float32)

    def add(self, vectors: np.ndarray, chunks: List[Chunk]) -> None:
        if len(chunks) == 0:
            return
        vectors = np.asarray(vectors, dtype=np.float32)
        if vectors.shape[0] != len(chunks):
            raise ValueError(
                f"vectors/chunks length mismatch: {vectors.shape[0]} vs {len(chunks)}"
            )
        if self.vectors.shape[0] == 0:
            self.vectors = vectors.reshape(len(chunks), self.dim)
        else:
            self.vectors = np.vstack([self.vectors, vectors])
        self.chunks.extend(chunks)

    def search(self, query: np.ndarray, k: int, allowed_nodes: Set[str]) -> List[RetrievedChunk]:
        if self.vectors.shape[0] == 0 or k <= 0:
            return []

        mask = np.array([chunk.node_id in allowed_nodes for chunk in self.chunks], dtype=bool)
        allowed_count = int(mask.sum())
        if allowed_count == 0:
            return []

        query_vec = np.asarray(query, dtype=np.float32).reshape(-1)
        scores = self.vectors @ query_vec
        scores = np.where(mask, scores, -np.inf)

        top_k = min(k, allowed_count)
        top_indices = np.argsort(-scores)[:top_k]

        return [
            RetrievedChunk(chunk=self.chunks[i], score=float(scores[i])) for i in top_indices
        ]

    def save(self, path: Path) -> None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        np.savez(
            path,
            vectors=self.vectors,
            dim=np.array(self.dim),
            embedder_name=np.array(self.embedder_name),
        )
        sidecar = _chunks_sidecar_path(path)
        sidecar.write_text(
            json.dumps([asdict(chunk) for chunk in self.chunks], indent=2, sort_keys=False),
            encoding="utf-8",
        )

    @classmethod
    def load(cls, path: Path) -> "NumpyStore":
        path = Path(path)
        with np.load(path, allow_pickle=False) as data:
            vectors = np.asarray(data["vectors"], dtype=np.float32)
            dim = int(data["dim"])
            embedder_name = str(data["embedder_name"])

        sidecar = _chunks_sidecar_path(path)
        chunks_data = json.loads(sidecar.read_text(encoding="utf-8")) if sidecar.exists() else []
        chunks = [Chunk(**entry) for entry in chunks_data]

        return cls(dim=dim, embedder_name=embedder_name, vectors=vectors, chunks=chunks)

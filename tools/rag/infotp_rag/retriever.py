"""The frozen facade (D10): Retriever, wiring an Embedder + VectorStore.

`DefaultRetriever` = HashingEmbedder + NumpyStore, persisted at
`<repo_root>/.rag/index.npz`. Branch scoping is enforced in `query()` via
`allowed_nodes = {n.id for n in store.parent_chain(node_id)}` — never
delegated implicitly to the store.
"""

from __future__ import annotations

import warnings
from pathlib import Path
from typing import List, Optional, Protocol, Set, runtime_checkable

import numpy as np
from infotp_composer.model import Node, Store

from .chunking import chunk_text
from .embedders import Embedder, HashingEmbedder, default_embedder
from .manifest import load_node_entries
from .types import Chunk, IndexStats, RetrievedChunk
from .vectorstore import NumpyStore, VectorStore

INDEXABLE_SUFFIXES = (".md", ".txt")
INDEX_FILENAME = "index.npz"


@runtime_checkable
class Retriever(Protocol):
    """Protocol for the swappable indexing + query facade."""

    def index(self, store: Store, node_id: Optional[str] = None) -> IndexStats: ...

    def query(
        self, store: Store, node_id: str, text: str, k: int = 5
    ) -> List[RetrievedChunk]: ...


def _resolve_target_nodes(store: Store, node_id: Optional[str]) -> List[Node]:
    if node_id is None:
        return list(store.nodes.values())
    return store.parent_chain(node_id)


def _build_chunks_and_vectors(
    store: Store, target_nodes: List[Node], embedder: Embedder
) -> tuple:
    """Read + chunk + embed every indexable corpus file for `target_nodes`.

    Returns (chunks, vectors, file_count). Non-.md/.txt entries and missing
    files are skipped with a warning (PDF extraction is future work).
    """
    chunks: List[Chunk] = []
    file_count = 0

    for node in target_nodes:
        if node.directory is None:
            continue
        corpus_dir = node.directory / "corpus"
        for entry in load_node_entries(node, store.repo_root):
            suffix = Path(entry.file).suffix.lower()
            file_path = corpus_dir / entry.file

            if suffix not in INDEXABLE_SUFFIXES:
                warnings.warn(
                    f"Skipping unsupported corpus file type for indexing: {file_path} "
                    f"(only {INDEXABLE_SUFFIXES} are indexed in P3)",
                    stacklevel=2,
                )
                continue
            if not file_path.exists():
                warnings.warn(f"Corpus entry listed but file is missing: {file_path}", stacklevel=2)
                continue

            text = file_path.read_text(encoding="utf-8")
            file_count += 1
            for ordinal, piece in enumerate(chunk_text(text)):
                chunks.append(
                    Chunk(
                        text=piece,
                        node_id=node.id,
                        file=entry.file,
                        title=entry.title,
                        ordinal=ordinal,
                    )
                )

    if chunks:
        vectors = embedder.embed([chunk.text for chunk in chunks])
    else:
        vectors = np.zeros((0, embedder.dim), dtype=np.float32)

    return chunks, vectors, file_count


class DefaultRetriever:
    """HashingEmbedder + NumpyStore, the CI-safe zero-network default."""

    def __init__(self, embedder: Optional[Embedder] = None) -> None:
        self.embedder: Embedder = embedder or default_embedder()

    def _index_path(self, store: Store) -> Path:
        return store.repo_root / ".rag" / INDEX_FILENAME

    def _load_compatible_store(self, index_path: Path) -> Optional[NumpyStore]:
        if not index_path.exists():
            return None
        try:
            existing = NumpyStore.load(index_path)
        except (OSError, ValueError, KeyError):
            return None
        if existing.embedder_name != self.embedder.name or existing.dim != self.embedder.dim:
            return None
        return existing

    def index(self, store: Store, node_id: Optional[str] = None) -> IndexStats:
        target_nodes = _resolve_target_nodes(store, node_id)
        target_ids = {node.id for node in target_nodes}

        new_chunks, new_vectors, file_count = _build_chunks_and_vectors(
            store, target_nodes, self.embedder
        )

        index_path = self._index_path(store)
        existing = self._load_compatible_store(index_path)

        merged = NumpyStore(dim=self.embedder.dim, embedder_name=self.embedder.name)
        if existing is not None:
            keep_mask = [chunk.node_id not in target_ids for chunk in existing.chunks]
            if any(keep_mask):
                kept_chunks = [c for c, keep in zip(existing.chunks, keep_mask) if keep]
                kept_vectors = existing.vectors[np.array(keep_mask)]
                merged.add(kept_vectors, kept_chunks)

        if new_chunks:
            merged.add(new_vectors, new_chunks)

        merged.save(index_path)

        return IndexStats(
            node_count=len(target_nodes),
            file_count=file_count,
            chunk_count=len(merged.chunks),
            embedder=self.embedder.name,
            dim=self.embedder.dim,
        )

    def query(self, store: Store, node_id: str, text: str, k: int = 5) -> List[RetrievedChunk]:
        chain = store.parent_chain(node_id)
        allowed_nodes: Set[str] = {node.id for node in chain}

        index_path = self._index_path(store)
        vector_store = self._load_compatible_store(index_path)

        if vector_store is None:
            # Never block: build an in-memory index for just this branch.
            chunks, vectors, _ = _build_chunks_and_vectors(store, chain, self.embedder)
            vector_store = NumpyStore(dim=self.embedder.dim, embedder_name=self.embedder.name)
            vector_store.add(vectors, chunks)

        query_vector = self.embedder.embed([text])[0]
        return vector_store.search(query_vector, k, allowed_nodes)

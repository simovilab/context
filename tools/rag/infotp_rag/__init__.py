"""infotp_rag — branch-scoped RAG engine for the InfoTP Context Studio (D10).

Reuses ``infotp_composer`` as a library for the repo tree walk (``Store``,
``Node``, ``Store.parent_chain``) and adds per-node corpus indexing and
branch-scoped retrieval behind a small, frozen facade: :class:`Embedder`,
:class:`VectorStore`, and :class:`Retriever`.
"""

from __future__ import annotations

from .chunking import chunk_text
from .embedders import (
    Embedder,
    HashingEmbedder,
    SentenceTransformerEmbedder,
    default_embedder,
    get_embedder,
)
from .manifest import ManifestEntry, ManifestError, load_node_entries
from .retriever import DefaultRetriever, Retriever
from .types import Chunk, IndexStats, RetrievedChunk
from .vectorstore import NumpyStore, VectorStore

__all__ = [
    "Chunk",
    "RetrievedChunk",
    "IndexStats",
    "Embedder",
    "HashingEmbedder",
    "SentenceTransformerEmbedder",
    "get_embedder",
    "default_embedder",
    "VectorStore",
    "NumpyStore",
    "Retriever",
    "DefaultRetriever",
    "chunk_text",
    "ManifestEntry",
    "ManifestError",
    "load_node_entries",
]

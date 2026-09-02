"""The frozen D10 units: Chunk, RetrievedChunk, IndexStats.

These dataclasses are the smallest shared vocabulary between the embedder,
vector store, and retriever roles — see CONTRACT.md "The frozen interface".
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class Chunk:
    """A single indexed window of text from one corpus file."""

    text: str
    node_id: str  # the node whose corpus owns the source file (provenance)
    file: str  # corpus filename
    title: Optional[str]  # from manifest
    ordinal: int  # chunk index within the file


@dataclass(frozen=True)
class RetrievedChunk:
    """A chunk returned from a query, with its similarity score."""

    chunk: Chunk
    score: float  # cosine similarity in [-1, 1], higher = better


@dataclass(frozen=True)
class IndexStats:
    """Summary of an indexing run, returned by Retriever.index."""

    node_count: int
    file_count: int
    chunk_count: int
    embedder: str
    dim: int

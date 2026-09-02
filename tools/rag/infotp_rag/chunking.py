"""Deterministic text chunker.

Splits a text file into overlapping windows (~800 chars, ~150 overlap),
preferring paragraph then sentence then whitespace boundaries so chunks read
naturally. Pure function of the input bytes: same text in, same chunks out,
every time (no randomness, no clock, no environment dependence).
"""

from __future__ import annotations

from typing import List

DEFAULT_WINDOW = 800
DEFAULT_OVERLAP = 150

_BOUNDARY_SEPARATORS = ("\n\n", ". ", "\n", " ")


def _find_boundary(text: str, start: int, end: int) -> int:
    """Look backward from `end` (within [start, end)) for the best boundary
    separator, returning the index just after it. Falls back to `end` when
    no boundary is found (mid-word cut, only for pathological input)."""
    window = text[start:end]
    for sep in _BOUNDARY_SEPARATORS:
        idx = window.rfind(sep)
        if idx > 0:
            return start + idx + len(sep)
    return end


def chunk_text(
    text: str,
    window: int = DEFAULT_WINDOW,
    overlap: int = DEFAULT_OVERLAP,
) -> List[str]:
    """Split `text` into overlapping windows, stripped and boundary-aware.

    Returns an empty list for empty/whitespace-only text. Deterministic given
    the same text, window, and overlap.
    """
    if window <= 0:
        raise ValueError(f"window must be positive, got {window}")
    if overlap < 0 or overlap >= window:
        raise ValueError(f"overlap must be in [0, window), got {overlap}")

    stripped = text.strip()
    if not stripped:
        return []
    if len(stripped) <= window:
        return [stripped]

    chunks: List[str] = []
    length = len(stripped)
    start = 0

    while start < length:
        end = min(start + window, length)
        if end < length:
            boundary = _find_boundary(stripped, start, end)
            if boundary > start:
                end = boundary

        piece = stripped[start:end].strip()
        if piece:
            chunks.append(piece)

        if end >= length:
            break

        next_start = end - overlap
        start = next_start if next_start > start else end

    return chunks

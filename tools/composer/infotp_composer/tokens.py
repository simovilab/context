"""Tokenizer interface for the composer's token meter (D9).

The token meter is designed to be pinned to a real target-model tokenizer
later; for now we ship a lightweight heuristic that adds no heavy
dependency. Any object implementing the ``Tokenizer`` protocol (a ``name``
attribute and a ``count(text) -> int`` method) can be substituted.
"""

from __future__ import annotations

import math
from typing import Protocol, runtime_checkable


@runtime_checkable
class Tokenizer(Protocol):
    """Protocol for anything that can estimate a token count for text."""

    name: str

    def count(self, text: str) -> int:
        ...


class HeuristicTokenizer:
    """A dependency-free heuristic: ~4 characters per token."""

    name = "heuristic-chars/4"

    def count(self, text: str) -> int:
        if not text:
            return 0
        return math.ceil(len(text) / 4)


class TiktokenTokenizer:
    """A tokenizer backed by OpenAI's ``tiktoken`` ``cl100k_base`` encoding.

    This is a *proxy* for whatever tokenizer the eventual target model uses —
    it is not guaranteed to match exactly. Per D9, the point of the token
    meter is the ``Tokenizer`` interface (name + count), not a specific
    backend; the backend is swappable, and this is simply a closer, still
    approximate, stand-in than the character heuristic.

    ``tiktoken`` is imported lazily inside ``__init__`` so this module (and
    ``HeuristicTokenizer``) keep working without the optional dependency
    installed.
    """

    name = "tiktoken-cl100k"

    def __init__(self) -> None:
        try:
            import tiktoken
        except ImportError as exc:  # pragma: no cover - exercised only when tiktoken absent
            raise ImportError(
                "tiktoken is required for TiktokenTokenizer. "
                'Install it with: pip install "infotp_composer[tokenizers]"'
            ) from exc
        self._encoding = tiktoken.get_encoding("cl100k_base")

    def count(self, text: str) -> int:
        if not text:
            return 0
        return len(self._encoding.encode(text))


def get_tokenizer(name: str) -> Tokenizer:
    """Factory: resolve a tokenizer by short name.

    "heuristic" -> HeuristicTokenizer, "tiktoken" -> TiktokenTokenizer.
    Raises ValueError for any other name.
    """
    if name == "heuristic":
        return HeuristicTokenizer()
    if name == "tiktoken":
        return TiktokenTokenizer()
    raise ValueError(f"Unknown tokenizer: {name!r}")


def default_tokenizer() -> Tokenizer:
    """Return the default tokenizer used when none is supplied."""
    return HeuristicTokenizer()

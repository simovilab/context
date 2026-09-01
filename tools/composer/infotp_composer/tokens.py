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


def default_tokenizer() -> Tokenizer:
    """Return the default tokenizer used when none is supplied."""
    return HeuristicTokenizer()

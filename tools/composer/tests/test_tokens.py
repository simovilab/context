import math

import pytest

from infotp_composer.tokens import (
    HeuristicTokenizer,
    TiktokenTokenizer,
    default_tokenizer,
    get_tokenizer,
)


def test_heuristic_tokenizer_name():
    t = HeuristicTokenizer()
    assert t.name == "heuristic-chars/4"


def test_heuristic_tokenizer_counts_chars_over_four():
    t = HeuristicTokenizer()
    text = "a" * 10
    assert t.count(text) == math.ceil(10 / 4)


def test_heuristic_tokenizer_empty_string_is_zero():
    t = HeuristicTokenizer()
    assert t.count("") == 0


def test_default_tokenizer_returns_heuristic():
    t = default_tokenizer()
    assert t.name == "heuristic-chars/4"
    assert t.count("abcd") == 1


def test_get_tokenizer_heuristic():
    t = get_tokenizer("heuristic")
    assert isinstance(t, HeuristicTokenizer)


def test_get_tokenizer_tiktoken():
    pytest.importorskip("tiktoken")
    t = get_tokenizer("tiktoken")
    assert isinstance(t, TiktokenTokenizer)


def test_get_tokenizer_unknown_raises_value_error():
    with pytest.raises(ValueError):
        get_tokenizer("nope")


def test_tiktoken_tokenizer_name():
    pytest.importorskip("tiktoken")
    t = TiktokenTokenizer()
    assert t.name == "tiktoken-cl100k"


def test_tiktoken_tokenizer_counts_positive_for_nonempty_text():
    pytest.importorskip("tiktoken")
    t = TiktokenTokenizer()
    assert t.count("Hello, world! This is a test sentence.") > 0


def test_tiktoken_tokenizer_empty_string_is_zero():
    pytest.importorskip("tiktoken")
    t = TiktokenTokenizer()
    assert t.count("") == 0

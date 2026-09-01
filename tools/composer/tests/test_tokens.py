import math

from infotp_composer.tokens import HeuristicTokenizer, default_tokenizer


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

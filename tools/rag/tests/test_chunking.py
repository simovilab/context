import pytest

from infotp_rag.chunking import chunk_text


def test_empty_text_returns_no_chunks():
    assert chunk_text("") == []
    assert chunk_text("   \n  ") == []


def test_short_text_is_a_single_chunk():
    text = "A short paragraph that fits in one window."
    assert chunk_text(text) == [text]


def test_long_text_is_split_into_overlapping_windows():
    paragraph = "Sentence number %d provides some filler content. "
    text = "\n\n".join(paragraph % i for i in range(40))  # well over 800 chars

    chunks = chunk_text(text, window=800, overlap=150)

    assert len(chunks) > 1
    for chunk in chunks:
        assert len(chunk) <= 800
    # Overlap: consecutive chunks should share some trailing/leading text.
    assert chunks[0] != chunks[1]


def test_chunking_is_deterministic():
    text = "Paragraph one.\n\n" + ("filler word " * 200) + "\n\nParagraph two."
    assert chunk_text(text) == chunk_text(text)


def test_prefers_paragraph_boundary_over_mid_word_cut():
    first_para = "A" * 700
    second_para = "B" * 700
    text = first_para + "\n\n" + second_para

    chunks = chunk_text(text, window=800, overlap=150)

    # The first chunk should end at (or very near) the paragraph boundary,
    # not mid-way through the B's.
    assert chunks[0].rstrip().endswith("A")


def test_invalid_window_raises():
    with pytest.raises(ValueError):
        chunk_text("hello", window=0)


def test_invalid_overlap_raises():
    with pytest.raises(ValueError):
        chunk_text("hello", window=100, overlap=100)
    with pytest.raises(ValueError):
        chunk_text("hello", window=100, overlap=-1)

import json
import shutil
from pathlib import Path

import pytest

from infotp_composer.cli import _strip_composed_at, discover_repo_root, main
from infotp_composer.model import CompositionError

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture()
def repo(tmp_path):
    dest = tmp_path / "repo"
    shutil.copytree(FIXTURES, dest)
    return dest


def test_compose_single_node_writes_json_and_md(repo, tmp_path):
    out = tmp_path / "out"
    rc = main(["compose", "C1P1", "--repo", str(repo), "--out", str(out)])
    assert rc == 0
    assert (out / "C1P1.json").exists()
    assert (out / "C1P1.md").exists()
    data = json.loads((out / "C1P1.json").read_text())
    assert data["id"] == "C1P1"


def test_compose_all_writes_every_node(repo, tmp_path):
    out = tmp_path / "out"
    rc = main(["compose", "--all", "--repo", str(repo), "--out", str(out)])
    assert rc == 0
    for node_id in ["project", "C1", "C1P1", "C1P2"]:
        assert (out / f"{node_id}.json").exists()
        assert (out / f"{node_id}.md").exists()


def test_compose_check_passes_when_up_to_date(repo, tmp_path):
    out = tmp_path / "out"
    assert main(["compose", "--all", "--repo", str(repo), "--out", str(out)]) == 0
    assert main(["compose", "--check", "--repo", str(repo), "--out", str(out)]) == 0


def test_compose_check_fails_when_stale(repo, tmp_path, capsys):
    out = tmp_path / "out"
    assert main(["compose", "--all", "--repo", str(repo), "--out", str(out)]) == 0

    # Corrupt one composed file to simulate drift.
    stale_path = out / "C1P1.json"
    data = json.loads(stale_path.read_text())
    data["directives"] = []
    stale_path.write_text(json.dumps(data))

    rc = main(["compose", "--check", "--repo", str(repo), "--out", str(out)])
    assert rc == 1
    captured = capsys.readouterr()
    assert "C1P1.json" in captured.err


def test_compose_check_fails_when_md_stale(repo, tmp_path):
    out = tmp_path / "out"
    assert main(["compose", "--all", "--repo", str(repo), "--out", str(out)]) == 0
    md_path = out / "C1P1.md"
    md_path.write_text(md_path.read_text() + "\nSTALE\n")

    rc = main(["compose", "--check", "--repo", str(repo), "--out", str(out)])
    assert rc == 1


def test_compose_check_fails_when_missing(repo, tmp_path):
    out = tmp_path / "out"
    assert main(["compose", "--all", "--repo", str(repo), "--out", str(out)]) == 0
    (out / "C1P2.json").unlink()

    rc = main(["compose", "--check", "--repo", str(repo), "--out", str(out)])
    assert rc == 1


def test_compose_requires_node_id_without_all_or_check(repo, tmp_path, capsys):
    out = tmp_path / "out"
    rc = main(["compose", "--repo", str(repo), "--out", str(out)])
    assert rc == 2


def test_compose_unknown_node_returns_error(repo, tmp_path, capsys):
    out = tmp_path / "out"
    rc = main(["compose", "NOPE", "--repo", str(repo), "--out", str(out)])
    assert rc == 1
    captured = capsys.readouterr()
    assert "error" in captured.err


def test_compose_stdout_prints_json_and_writes_no_file(repo, tmp_path, capsys):
    out = tmp_path / "out"
    rc = main(["compose", "C1P1", "--repo", str(repo), "--out", str(out), "--stdout", "--json"])
    assert rc == 0
    data = json.loads(capsys.readouterr().out)
    assert data["id"] == "C1P1"
    assert "directives" in data
    assert "token_estimate" in data
    assert not out.exists()


def test_compose_stdout_matches_to_json_shape(repo, tmp_path):
    from infotp_composer.compose import compose
    from infotp_composer.model import Store
    from infotp_composer.render import to_json

    out = tmp_path / "out"
    rc = main(["compose", "C1P1", "--repo", str(repo), "--out", str(out), "--stdout"])
    assert rc == 0

    store = Store.load(repo)
    expected = _strip_composed_at(to_json(compose(store, "C1P1")))

    import io
    import contextlib

    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc2 = main(["compose", "C1P1", "--repo", str(repo), "--out", str(out), "--stdout"])
    assert rc2 == 0
    actual = _strip_composed_at(json.loads(buf.getvalue()))
    assert actual == expected


def test_compose_stdout_requires_single_node_id(repo, tmp_path, capsys):
    out = tmp_path / "out"
    rc = main(["compose", "--all", "--repo", str(repo), "--out", str(out), "--stdout"])
    assert rc == 2
    assert "error" in capsys.readouterr().err

    rc2 = main(["compose", "--check", "--repo", str(repo), "--out", str(out), "--stdout"])
    assert rc2 == 2


def test_compose_stdout_without_node_id_errors(repo, tmp_path, capsys):
    out = tmp_path / "out"
    rc = main(["compose", "--repo", str(repo), "--out", str(out), "--stdout"])
    assert rc == 2
    assert "error" in capsys.readouterr().err


def test_compose_with_tokenizer_heuristic_explicit(repo, tmp_path):
    out = tmp_path / "out"
    rc = main(["compose", "C1P1", "--repo", str(repo), "--out", str(out), "--tokenizer", "heuristic"])
    assert rc == 0
    data = json.loads((out / "C1P1.json").read_text())
    assert data["token_estimate"]["method"] == "heuristic-chars/4"


def test_compose_with_tiktoken_tokenizer(repo, tmp_path):
    pytest.importorskip("tiktoken")
    out = tmp_path / "out"
    rc = main(["compose", "C1P1", "--repo", str(repo), "--out", str(out), "--tokenizer", "tiktoken"])
    assert rc == 0
    data = json.loads((out / "C1P1.json").read_text())
    assert data["token_estimate"]["method"] == "tiktoken-cl100k"


def test_discover_repo_root_walks_up(repo):
    nested = repo / "components" / "C1" / "deliverables" / "C1P1"
    found = discover_repo_root(nested)
    assert found == repo.resolve()


def test_discover_repo_root_raises_when_not_found(tmp_path):
    lonely = tmp_path / "nowhere"
    lonely.mkdir()
    with pytest.raises(CompositionError):
        discover_repo_root(lonely)

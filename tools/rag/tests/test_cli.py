import json
import shutil
import warnings
from pathlib import Path

from infotp_rag.cli import main

FIXTURES = Path(__file__).parent / "fixtures"


def _prepare_repo(tmp_path: Path) -> Path:
    shutil.copytree(FIXTURES, tmp_path, dirs_exist_ok=True)
    return tmp_path


def test_index_all_via_cli(tmp_path, capsys):
    repo = _prepare_repo(tmp_path)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        exit_code = main(["index", "--all", "--repo", str(repo)])
    assert exit_code == 0
    out = capsys.readouterr().out
    assert "Indexed" in out
    assert (repo / ".rag" / "index.npz").exists()


def test_query_json_output(tmp_path, capsys):
    repo = _prepare_repo(tmp_path)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        main(["index", "--all", "--repo", str(repo)])
    capsys.readouterr()

    exit_code = main(
        ["query", "C1P1", "public transport information", "-k", "3", "--json", "--repo", str(repo)]
    )
    assert exit_code == 0

    payload = json.loads(capsys.readouterr().out)
    assert payload["ok"] is True
    assert payload["embedder"] == "hashing"
    assert payload["node_id"] == "C1P1"
    assert payload["k"] == 3
    assert isinstance(payload["results"], list)
    for result in payload["results"]:
        assert set(result.keys()) == {"score", "text", "node_id", "file", "title", "ordinal"}
        assert result["node_id"] in {"project", "C1", "C1P1"}


def test_query_json_never_returns_sibling_branch(tmp_path, capsys):
    repo = _prepare_repo(tmp_path)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        main(["index", "--all", "--repo", str(repo)])
    capsys.readouterr()

    main(["query", "C1P1", "fare collection hardware warranty", "-k", "10", "--json", "--repo", str(repo)])
    payload = json.loads(capsys.readouterr().out)
    node_ids = {r["node_id"] for r in payload["results"]}
    assert "C1P2" not in node_ids
    assert "C2P1" not in node_ids


def test_index_requires_node_id_or_all(tmp_path, capsys):
    repo = _prepare_repo(tmp_path)
    exit_code = main(["index", "--repo", str(repo)])
    assert exit_code == 2
    err = capsys.readouterr().err
    assert "NODE_ID or --all is required" in err


def test_index_rejects_both_node_id_and_all(tmp_path, capsys):
    repo = _prepare_repo(tmp_path)
    exit_code = main(["index", "C1P1", "--all", "--repo", str(repo)])
    assert exit_code == 2


def test_query_unknown_node_exits_nonzero(tmp_path, capsys):
    repo = _prepare_repo(tmp_path)
    exit_code = main(["query", "NOPE", "anything", "--repo", str(repo)])
    assert exit_code == 1
    err = capsys.readouterr().err
    assert "error" in err.lower()


def test_query_text_output_no_results(tmp_path, capsys):
    repo = _prepare_repo(tmp_path)
    exit_code = main(["query", "C1P1", "zzz nonexistent gibberish qqq", "--repo", str(repo)])
    assert exit_code == 0
    out = capsys.readouterr().out
    assert out  # either "No results." or ranked (near-zero-score) results

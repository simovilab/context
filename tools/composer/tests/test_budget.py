import json
import shutil
from pathlib import Path

from infotp_composer.cli import main

FIXTURES = Path(__file__).parent / "fixtures"


def _copy_repo(tmp_path):
    dest = tmp_path / "repo"
    shutil.copytree(FIXTURES, dest)
    return dest


def test_budget_json_shape(tmp_path, capsys):
    repo = _copy_repo(tmp_path)
    rc = main(["budget", "--repo", str(repo), "--json"])
    assert rc == 0
    out = json.loads(capsys.readouterr().out)

    assert out["tokenBudget"] == 4000
    assert isinstance(out["components"], list)
    assert isinstance(out["overflows"], list)

    c1 = next(c for c in out["components"] if c["component"] == "C1")
    assert set(c1["worstLeaf"].keys()) == {"id", "tokens"}
    assert c1["worstLeaf"]["id"] in ("C1P1", "C1P2")
    assert isinstance(c1["worstLeaf"]["tokens"], int)


def test_budget_picks_max_token_leaf_per_component(tmp_path, capsys):
    repo = _copy_repo(tmp_path)
    rc = main(["budget", "--repo", str(repo), "--json"])
    assert rc == 0
    out = json.loads(capsys.readouterr().out)
    c1 = next(c for c in out["components"] if c["component"] == "C1")

    # C1P2 (docs) inherits more directives than C1P1 (software) in the
    # fixture tree, so it should be the worst leaf.
    assert c1["worstLeaf"]["id"] == "C1P2"


def test_budget_flags_overflows_with_low_budget(tmp_path, capsys):
    repo = _copy_repo(tmp_path)
    rc = main(["budget", "--repo", str(repo), "--budget", "1", "--json"])
    assert rc == 0
    out = json.loads(capsys.readouterr().out)
    assert out["tokenBudget"] == 1
    assert len(out["overflows"]) > 0
    assert "C1P2" in out["overflows"]


def test_budget_no_overflows_with_high_budget(tmp_path, capsys):
    repo = _copy_repo(tmp_path)
    rc = main(["budget", "--repo", str(repo), "--budget", "1000000", "--json"])
    assert rc == 0
    out = json.loads(capsys.readouterr().out)
    assert out["overflows"] == []


def test_budget_env_var_used_when_flag_omitted(tmp_path, capsys, monkeypatch):
    repo = _copy_repo(tmp_path)
    monkeypatch.setenv("STUDIO_TOKEN_BUDGET", "42")
    rc = main(["budget", "--repo", str(repo), "--json"])
    assert rc == 0
    out = json.loads(capsys.readouterr().out)
    assert out["tokenBudget"] == 42


def test_budget_flag_overrides_env_var(tmp_path, capsys, monkeypatch):
    repo = _copy_repo(tmp_path)
    monkeypatch.setenv("STUDIO_TOKEN_BUDGET", "42")
    rc = main(["budget", "--repo", str(repo), "--budget", "99", "--json"])
    assert rc == 0
    out = json.loads(capsys.readouterr().out)
    assert out["tokenBudget"] == 99


def test_budget_readable_table_without_json(tmp_path, capsys):
    repo = _copy_repo(tmp_path)
    rc = main(["budget", "--repo", str(repo)])
    assert rc == 0
    text = capsys.readouterr().out
    assert "Token budget" in text
    assert "C1" in text


def test_budget_with_tiktoken_tokenizer(tmp_path, capsys):
    import pytest

    pytest.importorskip("tiktoken")
    repo = _copy_repo(tmp_path)
    rc = main(["budget", "--repo", str(repo), "--tokenizer", "tiktoken", "--json"])
    assert rc == 0
    out = json.loads(capsys.readouterr().out)
    assert out["tokenBudget"] == 4000

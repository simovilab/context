from pathlib import Path

import pytest
import yaml
from infotp_composer.model import Node, Store

from infotp_rag.manifest import ManifestError, load_node_entries

FIXTURES = Path(__file__).parent / "fixtures"


def test_load_node_entries_from_manifest():
    store = Store.load(FIXTURES)
    node = store.get("C1P1")

    entries = load_node_entries(node, store.repo_root)
    files = {e.file for e in entries}

    assert files == {"gtfs-realtime-spec.md", "notes.txt", "unsupported-manual.pdf"}
    spec_entry = next(e for e in entries if e.file == "gtfs-realtime-spec.md")
    assert spec_entry.title == "GTFS Realtime Reference"
    assert spec_entry.lang == "en"


def test_load_node_entries_falls_back_when_no_manifest(tmp_path):
    import shutil

    shutil.copytree(FIXTURES, tmp_path, dirs_exist_ok=True)
    manifest_path = tmp_path / "components" / "C1" / "deliverables" / "C1P1" / "corpus" / "manifest.yaml"
    manifest_path.unlink()

    # Without a manifest, node.corpus falls back to node.yaml's `corpus:` list
    # (empty here, since the fixture node.yaml has no `corpus:` key).
    store = Store.load(tmp_path)
    node = store.get("C1P1")
    entries = load_node_entries(node, store.repo_root)
    assert entries == []


def test_invalid_manifest_raises_manifest_error(tmp_path):
    import shutil

    shutil.copytree(FIXTURES, tmp_path, dirs_exist_ok=True)
    manifest_path = tmp_path / "components" / "C1" / "deliverables" / "C1P1" / "corpus" / "manifest.yaml"
    data = yaml.safe_load(manifest_path.read_text())
    data["entries"][0]["file"] = "Not-Kebab-Case!!.md"  # violates the pattern
    manifest_path.write_text(yaml.safe_dump(data))

    # infotp_composer's Store.load already validates manifests during the
    # tree walk (composer reconciliation), so an invalid manifest surfaces
    # there first. Exercise infotp_rag's own validation directly against a
    # hand-built Node so both validation paths are covered independently.
    node = Node(
        id="C1P1",
        name="Test Deliverable One",
        kind=["software"],
        directory=tmp_path / "components" / "C1" / "deliverables" / "C1P1",
    )
    with pytest.raises(ManifestError):
        load_node_entries(node, tmp_path)

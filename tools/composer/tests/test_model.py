import shutil
from pathlib import Path

import pytest
import yaml

from infotp_composer.model import CompositionError, Store

FIXTURES = Path(__file__).parent / "fixtures"


def test_store_loads_all_fixture_nodes():
    store = Store.load(FIXTURES)
    assert set(store.nodes.keys()) == {"project", "C1", "C1P1", "C1P2"}


def test_parent_chain_component_falls_back_to_id_prefix_when_no_component_field(tmp_path):
    _copy_fixtures(tmp_path)
    # Remove the explicit `component` field to exercise the id-prefix fallback.
    node_path = tmp_path / "components" / "C1" / "deliverables" / "C1P1" / "node.yaml"
    data = yaml.safe_load(node_path.read_text())
    del data["component"]
    node_path.write_text(yaml.safe_dump(data))

    store = Store.load(tmp_path)
    chain = store.parent_chain("C1P1")
    assert [n.id for n in chain] == ["project", "C1", "C1P1"]


def test_missing_node_yaml_raises(tmp_path):
    _copy_fixtures(tmp_path)
    (tmp_path / "project" / "node.yaml").unlink()
    with pytest.raises(CompositionError):
        Store.load(tmp_path)


def test_invalid_node_yaml_raises_clear_error(tmp_path):
    _copy_fixtures(tmp_path)
    node_path = tmp_path / "project" / "node.yaml"
    data = yaml.safe_load(node_path.read_text())
    data["kind"] = []  # violates minItems: 1
    node_path.write_text(yaml.safe_dump(data))

    with pytest.raises(CompositionError) as excinfo:
        Store.load(tmp_path)
    assert "node.yaml" in str(excinfo.value)


def test_invalid_directives_yaml_raises_clear_error(tmp_path):
    _copy_fixtures(tmp_path)
    directives_path = tmp_path / "project" / "directives.yaml"
    data = yaml.safe_load(directives_path.read_text())
    data["directives"][0]["op"] = "bogus-op"
    directives_path.write_text(yaml.safe_dump(data))

    with pytest.raises(CompositionError) as excinfo:
        Store.load(tmp_path)
    assert "directives.yaml" in str(excinfo.value)


def test_missing_required_ancestor_component_raises(tmp_path):
    _copy_fixtures(tmp_path)
    # Point the deliverable's `component` field at a component id that is
    # never loaded, so the parent chain lookup must fail clearly.
    node_path = tmp_path / "components" / "C1" / "deliverables" / "C1P1" / "node.yaml"
    data = yaml.safe_load(node_path.read_text())
    data["component"] = "C9"
    node_path.write_text(yaml.safe_dump(data))

    store = Store.load(tmp_path)
    with pytest.raises(CompositionError):
        store.parent_chain("C1P1")


def test_cycle_detection_raises(tmp_path):
    _copy_fixtures(tmp_path)
    node_path = tmp_path / "components" / "C1" / "node.yaml"
    data = yaml.safe_load(node_path.read_text())
    data["depends_on"] = ["C1"]  # self-cycle
    node_path.write_text(yaml.safe_dump(data))

    with pytest.raises(CompositionError):
        Store.load(tmp_path)


def test_get_unknown_id_raises():
    store = Store.load(FIXTURES)
    with pytest.raises(CompositionError):
        store.get("NOPE")


def _copy_fixtures(dest: Path) -> None:
    shutil.copytree(FIXTURES, dest, dirs_exist_ok=True)

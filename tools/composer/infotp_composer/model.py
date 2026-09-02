"""Data model + loaders for InfoTP Context Studio nodes.

A *node* is a folder (D2) containing a ``node.yaml`` (structured identity),
an optional sibling ``directives.yaml`` (rules), and prose. This module loads
and validates those files against the JSON Schemas in ``schemas/`` and
assembles a :class:`Store` — a registry of every :class:`Node` in the repo.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

import yaml
from jsonschema import Draft202012Validator
from referencing import Registry, Resource


class CompositionError(Exception):
    """Raised for any structural/validation problem while loading the store."""


@dataclass(frozen=True)
class Directive:
    """A single directive, as declared in a directives.yaml or inline in node.yaml."""

    key: str
    op: str  # 'set' | 'extend' | 'suppress'
    applies_to: List[str] = field(default_factory=list)
    text: Optional[str] = None
    lang: str = "en"
    source_id: str = ""


@dataclass
class Node:
    """A parsed node: node.yaml fields plus its combined ordered directive list."""

    id: str
    name: str
    kind: List[str]
    component: Optional[str] = None
    result: Optional[dict] = None
    status: str = "not-started"
    owner: List[str] = field(default_factory=list)
    depends_on: List[str] = field(default_factory=list)
    hito: Optional[str] = None
    due_month: Optional[int] = None
    corpus: List[str] = field(default_factory=list)
    directives: List[Directive] = field(default_factory=list)
    directory: Optional[Path] = None
    layer: str = "deliverable"  # 'project' | 'component' | 'deliverable'


def _load_schemas(schemas_dir: Path) -> Draft202012Validator:
    """Build a Draft202012Validator for node.schema.json with a Registry that
    resolves the directives.schema.json $ref by both bare name and $id URL.
    """
    node_schema_path = schemas_dir / "node.schema.json"
    directives_schema_path = schemas_dir / "directives.schema.json"

    node_schema = json.loads(node_schema_path.read_text(encoding="utf-8"))
    directives_schema = json.loads(directives_schema_path.read_text(encoding="utf-8"))

    directives_id = directives_schema.get("$id", "directives.schema.json")
    resource = Resource.from_contents(directives_schema)

    registry = Registry().with_resources(
        [
            ("directives.schema.json", resource),
            (directives_id, resource),
        ]
    )

    return Draft202012Validator(node_schema, registry=registry)


def _load_corpus_validator(schemas_dir: Path) -> Optional[Draft202012Validator]:
    """Build a validator for corpus.schema.json, or None if the schema file
    is absent (older fixtures / repos that predate D10 manifests)."""
    corpus_schema_path = schemas_dir / "corpus.schema.json"
    if not corpus_schema_path.exists():
        return None
    corpus_schema = json.loads(corpus_schema_path.read_text(encoding="utf-8"))
    return Draft202012Validator(corpus_schema)


def _load_directives_validator(schemas_dir: Path) -> Draft202012Validator:
    directives_schema_path = schemas_dir / "directives.schema.json"
    directives_schema = json.loads(directives_schema_path.read_text(encoding="utf-8"))
    resource = Resource.from_contents(directives_schema)
    directives_id = directives_schema.get("$id", "directives.schema.json")
    registry = Registry().with_resources(
        [
            ("directives.schema.json", resource),
            (directives_id, resource),
        ]
    )
    return Draft202012Validator(directives_schema, registry=registry)


def _read_yaml(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh)
    return data or {}


def _validate(validator: Draft202012Validator, data: dict, path: Path) -> None:
    errors = sorted(validator.iter_errors(data), key=lambda e: list(e.path))
    if errors:
        messages = "; ".join(f"{list(e.path)}: {e.message}" for e in errors)
        raise CompositionError(f"Schema validation failed for {path}: {messages}")


def _parse_directive_dict(d: dict, source_id: str) -> Directive:
    return Directive(
        key=d["key"],
        op=d["op"],
        applies_to=list(d.get("applies_to", [])),
        text=d.get("text"),
        lang=d.get("lang", "en"),
        source_id=source_id,
    )


def _load_corpus_from_manifest(
    directory: Path,
    corpus_validator: Optional[Draft202012Validator],
) -> Optional[List[str]]:
    """Read <directory>/corpus/manifest.yaml (D10) if present, returning its
    entries[].file list. Returns None when no manifest exists, signalling the
    caller to fall back to the node.yaml `corpus:` list."""
    manifest_path = directory / "corpus" / "manifest.yaml"
    if not manifest_path.exists():
        return None

    manifest_data = _read_yaml(manifest_path)
    if corpus_validator is not None:
        _validate(corpus_validator, manifest_data, manifest_path)

    return [entry["file"] for entry in manifest_data.get("entries", [])]


def _load_node_dir(
    directory: Path,
    node_validator: Draft202012Validator,
    directives_validator: Draft202012Validator,
    layer: str = "deliverable",
    corpus_validator: Optional[Draft202012Validator] = None,
) -> Node:
    node_yaml_path = directory / "node.yaml"
    if not node_yaml_path.exists():
        raise CompositionError(f"Missing node.yaml in {directory}")

    node_data = _read_yaml(node_yaml_path)
    _validate(node_validator, node_data, node_yaml_path)

    node_id = node_data["id"]

    directives: List[Directive] = []

    directives_yaml_path = directory / "directives.yaml"
    if directives_yaml_path.exists():
        directives_data = _read_yaml(directives_yaml_path)
        _validate(directives_validator, directives_data, directives_yaml_path)
        for d in directives_data.get("directives", []):
            directives.append(_parse_directive_dict(d, node_id))

    for d in node_data.get("directives", []):
        directives.append(_parse_directive_dict(d, node_id))

    manifest_corpus = _load_corpus_from_manifest(directory, corpus_validator)
    corpus = manifest_corpus if manifest_corpus is not None else list(node_data.get("corpus", []))

    return Node(
        id=node_id,
        name=node_data["name"],
        kind=list(node_data.get("kind", [])),
        component=node_data.get("component"),
        result=node_data.get("result"),
        status=node_data.get("status", "not-started"),
        owner=list(node_data.get("owner", [])),
        depends_on=list(node_data.get("depends_on", [])),
        hito=node_data.get("hito"),
        due_month=node_data.get("due_month"),
        corpus=corpus,
        directives=directives,
        directory=directory,
        layer=layer,
    )


@dataclass
class Store:
    """The whole repo: a registry of nodes plus each node's parent chain."""

    repo_root: Path
    nodes: Dict[str, Node] = field(default_factory=dict)

    @classmethod
    def load(cls, repo_root: Path) -> "Store":
        repo_root = Path(repo_root)
        schemas_dir = repo_root / "schemas"
        node_validator = _load_schemas(schemas_dir)
        directives_validator = _load_directives_validator(schemas_dir)
        corpus_validator = _load_corpus_validator(schemas_dir)

        nodes: Dict[str, Node] = {}

        project_dir = repo_root / "project"
        if project_dir.exists():
            project_node = _load_node_dir(
                project_dir,
                node_validator,
                directives_validator,
                layer="project",
                corpus_validator=corpus_validator,
            )
            nodes[project_node.id] = project_node

        components_dir = repo_root / "components"
        if components_dir.exists():
            for component_dir in sorted(p for p in components_dir.iterdir() if p.is_dir()):
                if not (component_dir / "node.yaml").exists():
                    continue
                component_node = _load_node_dir(
                    component_dir,
                    node_validator,
                    directives_validator,
                    layer="component",
                    corpus_validator=corpus_validator,
                )
                nodes[component_node.id] = component_node

                deliverables_dir = component_dir / "deliverables"
                if deliverables_dir.exists():
                    for deliverable_dir in sorted(p for p in deliverables_dir.iterdir() if p.is_dir()):
                        if not (deliverable_dir / "node.yaml").exists():
                            continue
                        deliverable_node = _load_node_dir(
                            deliverable_dir,
                            node_validator,
                            directives_validator,
                            layer="deliverable",
                            corpus_validator=corpus_validator,
                        )
                        nodes[deliverable_node.id] = deliverable_node

        store = cls(repo_root=repo_root, nodes=nodes)
        store._check_cycles()
        return store

    def get(self, node_id: str) -> Node:
        try:
            return self.nodes[node_id]
        except KeyError as exc:
            raise CompositionError(f"Unknown node id: {node_id!r}") from exc

    def parent_chain(self, node_id: str) -> List[Node]:
        """Return the chain from least to most specific ancestor, target last.

        - project -> [project]
        - component C# -> [project, C#]
        - deliverable C#P# -> [project, <its component>, C#P#]
        """
        target = self.get(node_id)

        if target.layer == "project":
            return [target]

        project_node = self.nodes.get("project")
        if project_node is None:
            raise CompositionError("Missing required ancestor: project")

        if target.layer == "component":
            return [project_node, target]

        # deliverable: use the `component` field, falling back to the id prefix
        component_id = target.component
        if component_id is None:
            import re

            m = re.match(r"^(.*?)P\d+$", target.id)
            component_id = m.group(1) if m else target.id

        component_node = self.nodes.get(component_id)
        if component_node is None:
            raise CompositionError(
                f"Missing required ancestor component {component_id!r} for node {target.id!r}"
            )

        return [project_node, component_node, target]

    def _check_cycles(self) -> None:
        """Detect cycles in the depends_on graph (separate from the parent chain)."""
        WHITE, GRAY, BLACK = 0, 1, 2
        color = {node_id: WHITE for node_id in self.nodes}

        def visit(node_id: str, stack: List[str]) -> None:
            color[node_id] = GRAY
            stack.append(node_id)
            node = self.nodes.get(node_id)
            if node is not None:
                for dep in node.depends_on:
                    if dep not in self.nodes:
                        continue
                    if color.get(dep, WHITE) == WHITE:
                        visit(dep, stack)
                    elif color.get(dep) == GRAY:
                        cycle_start = stack.index(dep)
                        cycle = stack[cycle_start:] + [dep]
                        raise CompositionError(
                            f"Cycle detected in depends_on graph: {' -> '.join(cycle)}"
                        )
            stack.pop()
            color[node_id] = BLACK

        for node_id in list(self.nodes):
            if color[node_id] == WHITE:
                visit(node_id, [])

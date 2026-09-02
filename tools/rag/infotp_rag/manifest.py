"""Per-node corpus manifest loading (D10).

Reads ``<node>/corpus/manifest.yaml``, validates it against
``schemas/corpus.schema.json`` when that schema is available, and yields
(file, title, lang) entries. Falls back to a node's ``node.yaml``-derived
``corpus:`` file list (already reconciled by infotp_composer) when no
manifest exists — those entries simply carry no title/lang metadata.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

import yaml
from infotp_composer.model import Node
from jsonschema import Draft202012Validator


class ManifestError(Exception):
    """Raised when a corpus/manifest.yaml fails schema validation."""


@dataclass(frozen=True)
class ManifestEntry:
    """One corpus document, as declared in manifest.yaml (or inferred)."""

    file: str
    title: Optional[str] = None
    lang: Optional[str] = None


def _read_yaml(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh)
    return data or {}


def _load_manifest_file(manifest_path: Path, repo_root: Path) -> List[ManifestEntry]:
    data = _read_yaml(manifest_path)

    schema_path = repo_root / "schemas" / "corpus.schema.json"
    if schema_path.exists():
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        validator = Draft202012Validator(schema)
        errors = sorted(validator.iter_errors(data), key=lambda e: list(e.path))
        if errors:
            messages = "; ".join(f"{list(e.path)}: {e.message}" for e in errors)
            raise ManifestError(f"Schema validation failed for {manifest_path}: {messages}")

    entries: List[ManifestEntry] = []
    for entry in data.get("entries", []):
        entries.append(
            ManifestEntry(
                file=entry["file"],
                title=entry.get("title"),
                lang=entry.get("lang"),
            )
        )
    return entries


def load_node_entries(node: Node, repo_root: Path) -> List[ManifestEntry]:
    """Return this node's corpus entries: manifest.yaml if present, else the
    bare filenames already resolved onto `node.corpus` by infotp_composer."""
    if node.directory is not None:
        manifest_path = node.directory / "corpus" / "manifest.yaml"
        if manifest_path.exists():
            return _load_manifest_file(manifest_path, repo_root)

    return [ManifestEntry(file=filename) for filename in node.corpus]

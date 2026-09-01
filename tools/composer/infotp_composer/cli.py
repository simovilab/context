"""CLI for infotp_composer: ``python -m infotp_composer compose ...``."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import List, Optional

from .compose import compose
from .model import CompositionError, Store
from .render import to_json, to_markdown


def discover_repo_root(start: Optional[Path] = None) -> Path:
    """Walk up from ``start`` (default CWD) to find a directory containing
    both ``schemas/`` and ``project/``."""
    current = Path(start or Path.cwd()).resolve()
    for candidate in [current, *current.parents]:
        if (candidate / "schemas").is_dir() and (candidate / "project").is_dir():
            return candidate
    raise CompositionError(
        "Could not discover repo root: no ancestor directory contains both "
        "schemas/ and project/. Pass --repo explicitly."
    )


def _write_outputs(store: Store, node_id: str, out_dir: Path) -> None:
    composed = compose(store, node_id)
    json_path = out_dir / f"{node_id}.json"
    md_path = out_dir / f"{node_id}.md"
    json_path.write_text(json.dumps(to_json(composed), indent=2, sort_keys=False) + "\n", encoding="utf-8")
    md_path.write_text(to_markdown(composed), encoding="utf-8")


def _strip_composed_at(data: dict) -> dict:
    return {k: v for k, v in data.items() if k != "composed_at"}


def _check(store: Store, out_dir: Path) -> List[str]:
    """Return a list of human-readable problems (empty = up to date)."""
    problems: List[str] = []
    for node_id in sorted(store.nodes.keys()):
        composed = compose(store, node_id)
        expected_json = _strip_composed_at(to_json(composed))
        expected_md = to_markdown(composed)

        json_path = out_dir / f"{node_id}.json"
        md_path = out_dir / f"{node_id}.md"

        if not json_path.exists():
            problems.append(f"missing: {json_path}")
        else:
            try:
                actual_json = _strip_composed_at(json.loads(json_path.read_text(encoding="utf-8")))
            except json.JSONDecodeError:
                actual_json = None
            if actual_json != expected_json:
                problems.append(f"stale: {json_path}")

        if not md_path.exists():
            problems.append(f"missing: {md_path}")
        else:
            actual_md = md_path.read_text(encoding="utf-8")
            if actual_md != expected_md:
                problems.append(f"stale: {md_path}")

    return problems


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="infotp_composer")
    subparsers = parser.add_subparsers(dest="command", required=True)

    compose_parser = subparsers.add_parser("compose", help="Compose one or all nodes.")
    compose_parser.add_argument("node_id", nargs="?", default=None, help="Node id to compose.")
    compose_parser.add_argument("--repo", type=Path, default=None, help="Repo root.")
    compose_parser.add_argument("--out", type=Path, default=None, help="Output directory.")
    compose_parser.add_argument("--all", action="store_true", help="Compose every node.")
    compose_parser.add_argument(
        "--check", action="store_true", help="Check .composed/ is up to date; exit non-zero if stale."
    )

    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command != "compose":
        parser.print_help()
        return 2

    try:
        repo_root = Path(args.repo).resolve() if args.repo else discover_repo_root()
        out_dir = Path(args.out).resolve() if args.out else repo_root / ".composed"

        store = Store.load(repo_root)

        if args.check:
            problems = _check(store, out_dir)
            if problems:
                print("Composed output is stale or missing:", file=sys.stderr)
                for p in problems:
                    print(f"  - {p}", file=sys.stderr)
                return 1
            print("Composed output is up to date.")
            return 0

        out_dir.mkdir(parents=True, exist_ok=True)

        if args.all:
            for node_id in sorted(store.nodes.keys()):
                _write_outputs(store, node_id, out_dir)
            print(f"Composed {len(store.nodes)} node(s) into {out_dir}")
            return 0

        if not args.node_id:
            print("error: NODE_ID is required unless --all or --check is given", file=sys.stderr)
            return 2

        _write_outputs(store, args.node_id, out_dir)
        print(f"Composed {args.node_id} into {out_dir}")
        return 0

    except CompositionError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())

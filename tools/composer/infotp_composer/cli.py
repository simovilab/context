"""CLI for infotp_composer: ``python -m infotp_composer compose ...``."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import List, Optional

from .budget import budget_to_json, compute_budget
from .compose import compose
from .model import CompositionError, Store
from .render import to_json, to_markdown
from .tokens import Tokenizer, get_tokenizer

DEFAULT_TOKEN_BUDGET = 4000


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


def _write_outputs(store: Store, node_id: str, out_dir: Path, tokenizer: Optional[Tokenizer] = None) -> None:
    composed = compose(store, node_id, tokenizer=tokenizer)
    json_path = out_dir / f"{node_id}.json"
    md_path = out_dir / f"{node_id}.md"
    json_path.write_text(json.dumps(to_json(composed), indent=2, sort_keys=False) + "\n", encoding="utf-8")
    md_path.write_text(to_markdown(composed), encoding="utf-8")


def _strip_composed_at(data: dict) -> dict:
    return {k: v for k, v in data.items() if k != "composed_at"}


def _check(store: Store, out_dir: Path, tokenizer: Optional[Tokenizer] = None) -> List[str]:
    """Return a list of human-readable problems (empty = up to date)."""
    problems: List[str] = []
    for node_id in sorted(store.nodes.keys()):
        composed = compose(store, node_id, tokenizer=tokenizer)
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
    compose_parser.add_argument(
        "--tokenizer",
        choices=["heuristic", "tiktoken"],
        default="heuristic",
        help="Tokenizer used for the token estimate.",
    )
    compose_parser.add_argument(
        "--stdout",
        action="store_true",
        help="Compose a single node and print its JSON to stdout; writes no .composed/ file.",
    )
    compose_parser.add_argument(
        "--json",
        action="store_true",
        help="Machine-readable JSON output (implied when --stdout is given).",
    )

    budget_parser = subparsers.add_parser(
        "budget", help="Report the per-branch worst-case-leaf token budget."
    )
    budget_parser.add_argument("--repo", type=Path, default=None, help="Repo root.")
    budget_parser.add_argument(
        "--tokenizer",
        choices=["heuristic", "tiktoken"],
        default="heuristic",
        help="Tokenizer used for the token estimate.",
    )
    budget_parser.add_argument(
        "--budget",
        type=int,
        default=None,
        help="Token budget (default 4000; also read from STUDIO_TOKEN_BUDGET).",
    )
    budget_parser.add_argument("--json", action="store_true", help="Machine-readable JSON output.")

    return parser


def _resolve_token_budget(cli_value: Optional[int]) -> int:
    if cli_value is not None:
        return cli_value
    env_value = os.environ.get("STUDIO_TOKEN_BUDGET")
    if env_value:
        try:
            return int(env_value)
        except ValueError:
            pass
    return DEFAULT_TOKEN_BUDGET


def _print_budget_table(report_json: dict) -> None:
    print(f"Token budget: {report_json['tokenBudget']}")
    print(f"{'Component':<10} {'Worst leaf':<14} {'Tokens':>8}")
    for entry in report_json["components"]:
        worst = entry.get("worstLeaf")
        leaf_id = worst["id"] if worst else "-"
        tokens = worst["tokens"] if worst else "-"
        print(f"{entry['component']:<10} {leaf_id:<14} {tokens!s:>8}")
    if report_json["overflows"]:
        print("Overflows: " + ", ".join(report_json["overflows"]))
    else:
        print("Overflows: none")


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command not in ("compose", "budget"):
        parser.print_help()
        return 2

    try:
        repo_root = Path(args.repo).resolve() if args.repo else discover_repo_root()
        store = Store.load(repo_root)

        if args.command == "budget":
            tokenizer = get_tokenizer(args.tokenizer)
            token_budget = _resolve_token_budget(args.budget)
            report = compute_budget(store, tokenizer, token_budget)
            report_json = budget_to_json(report)
            if args.json:
                print(json.dumps(report_json, indent=2, sort_keys=False))
            else:
                _print_budget_table(report_json)
            return 0

        # command == "compose"
        tokenizer = get_tokenizer(args.tokenizer)
        out_dir = Path(args.out).resolve() if args.out else repo_root / ".composed"

        if args.stdout:
            if args.all or args.check:
                print("error: --stdout is only valid with a single NODE_ID, not --all/--check", file=sys.stderr)
                return 2
            if not args.node_id:
                print("error: NODE_ID is required with --stdout", file=sys.stderr)
                return 2
            composed = compose(store, args.node_id, tokenizer=tokenizer)
            print(json.dumps(to_json(composed), indent=2, sort_keys=False))
            return 0

        if args.check:
            problems = _check(store, out_dir, tokenizer=tokenizer)
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
                _write_outputs(store, node_id, out_dir, tokenizer=tokenizer)
            print(f"Composed {len(store.nodes)} node(s) into {out_dir}")
            return 0

        if not args.node_id:
            print("error: NODE_ID is required unless --all or --check is given", file=sys.stderr)
            return 2

        _write_outputs(store, args.node_id, out_dir, tokenizer=tokenizer)
        print(f"Composed {args.node_id} into {out_dir}")
        return 0

    except CompositionError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except ImportError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())

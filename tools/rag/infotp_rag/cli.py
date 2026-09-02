"""CLI for infotp_rag: ``python -m infotp_rag index|query ...``."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import List, Optional

from infotp_composer.cli import discover_repo_root
from infotp_composer.model import CompositionError, Store

from .embedders import get_embedder
from .manifest import ManifestError
from .retriever import DefaultRetriever


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="infotp_rag")
    subparsers = parser.add_subparsers(dest="command", required=True)

    index_parser = subparsers.add_parser("index", help="Index one node's branch or --all.")
    index_parser.add_argument("node_id", nargs="?", default=None, help="Node id to index.")
    index_parser.add_argument("--all", action="store_true", help="Index every node.")
    index_parser.add_argument("--repo", type=Path, default=None, help="Repo root.")
    index_parser.add_argument(
        "--embedder", choices=["hashing", "semantic"], default="hashing", help="Embedder backend."
    )

    query_parser = subparsers.add_parser("query", help="Branch-scoped retrieval query.")
    query_parser.add_argument("node_id", help="Node id to query from (scopes to its branch).")
    query_parser.add_argument("text", help="Query text.")
    query_parser.add_argument("-k", type=int, default=5, help="Number of results.")
    query_parser.add_argument("--json", action="store_true", help="Machine-readable JSON output.")
    query_parser.add_argument(
        "--embedder", choices=["hashing", "semantic"], default="hashing", help="Embedder backend."
    )
    query_parser.add_argument("--repo", type=Path, default=None, help="Repo root.")

    return parser


def _print_error(message: str, as_json: bool) -> None:
    if as_json:
        print(json.dumps({"ok": False, "error": message}), file=sys.stderr)
    else:
        print(f"error: {message}", file=sys.stderr)


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    as_json = bool(getattr(args, "json", False))

    try:
        repo_root = Path(args.repo).resolve() if args.repo else discover_repo_root()
        store = Store.load(repo_root)
        embedder = get_embedder(args.embedder)
        retriever = DefaultRetriever(embedder=embedder)

        if args.command == "index":
            if args.all and args.node_id:
                _print_error("pass either NODE_ID or --all, not both", as_json)
                return 2
            if not args.all and not args.node_id:
                _print_error("NODE_ID or --all is required", as_json)
                return 2

            target_id = None if args.all else args.node_id
            stats = retriever.index(store, target_id)
            print(
                f"Indexed {stats.node_count} node(s), {stats.file_count} file(s), "
                f"{stats.chunk_count} chunk(s) with {stats.embedder} (dim={stats.dim})"
            )
            return 0

        # command == "query"
        results = retriever.query(store, args.node_id, args.text, k=args.k)

        if args.json:
            payload = {
                "ok": True,
                "embedder": embedder.name,
                "node_id": args.node_id,
                "k": args.k,
                "results": [
                    {
                        "score": result.score,
                        "text": result.chunk.text,
                        "node_id": result.chunk.node_id,
                        "file": result.chunk.file,
                        "title": result.chunk.title,
                        "ordinal": result.chunk.ordinal,
                    }
                    for result in results
                ],
            }
            print(json.dumps(payload, indent=2, sort_keys=False))
        else:
            if not results:
                print("No results.")
            for result in results:
                title = f" — {result.chunk.title}" if result.chunk.title else ""
                print(
                    f"[{result.score:.3f}] {result.chunk.node_id}/{result.chunk.file}"
                    f"#{result.chunk.ordinal}{title}"
                )
                preview = result.chunk.text[:200].replace("\n", " ")
                print(f"    {preview}")
        return 0

    except (CompositionError, ManifestError, ValueError, ImportError) as exc:
        _print_error(str(exc), as_json)
        return 1


if __name__ == "__main__":
    sys.exit(main())

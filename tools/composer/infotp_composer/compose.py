"""The composition algorithm (the crux of the engine).

Walks a node's parent chain from least to most specific (project first,
target last), accumulating directives per key with set/extend/suppress
semantics filtered by the target's ``kind`` (D3), and separately unions
reference corpora up the chain (unfiltered, D10/AGENTS.md).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from .model import Directive, Node, Store
from .tokens import Tokenizer, default_tokenizer


@dataclass
class EffectiveDirective:
    """A directive as it appears in the composed output for one node."""

    key: str
    text: str
    applies_to: List[str]
    lang: str
    sources: List[str]


@dataclass
class ReferenceEntry:
    """One corpus file accumulated up the chain."""

    file: str
    source: str
    path: str


@dataclass
class ComposedNode:
    """The result of composing a single target node."""

    id: str
    name: str
    component: Optional[str]
    kind: List[str]
    status: str
    owner: List[str]
    result: Optional[dict]
    depends_on: List[str]
    hito: Optional[str]
    due_month: Optional[int]
    chain: List[str]
    directives: List[EffectiveDirective]
    reference: List[ReferenceEntry]
    token_estimate: Dict[str, object]


@dataclass
class _Acc:
    """Mutable accumulator entry for one directive key during the walk."""

    texts: List[str] = field(default_factory=list)
    sources: List[str] = field(default_factory=list)
    applies_to: List[str] = field(default_factory=list)
    lang: str = "en"
    suppressed: bool = False


def _applies(directive: Directive, kind_set: set) -> bool:
    return bool(set(directive.applies_to) & kind_set)


def _apply_directive(acc: Dict[str, _Acc], d: Directive) -> None:
    entry = acc.get(d.key)

    if d.op == "set":
        acc[d.key] = _Acc(
            texts=[d.text or ""],
            sources=[d.source_id],
            applies_to=list(d.applies_to),
            lang=d.lang,
            suppressed=False,
        )
        return

    if d.op == "extend":
        if entry is not None and not entry.suppressed:
            entry.texts.append(d.text or "")
            if d.source_id not in entry.sources:
                entry.sources.append(d.source_id)
            entry.applies_to = list(d.applies_to)
            entry.lang = d.lang
        else:
            acc[d.key] = _Acc(
                texts=[d.text or ""],
                sources=[d.source_id],
                applies_to=list(d.applies_to),
                lang=d.lang,
                suppressed=False,
            )
        return

    if d.op == "suppress":
        if entry is not None:
            entry.suppressed = True
        else:
            acc[d.key] = _Acc(
                texts=[],
                sources=[d.source_id],
                applies_to=list(d.applies_to),
                lang=d.lang,
                suppressed=True,
            )
        return

    raise ValueError(f"Unknown directive op: {d.op!r}")


def _accumulate_reference(chain: List[Node], repo_root) -> List[ReferenceEntry]:
    entries: List[ReferenceEntry] = []
    seen = set()
    for node in chain:
        for filename in node.corpus:
            dedup_key = (node.id, filename)
            if dedup_key in seen:
                continue
            seen.add(dedup_key)
            node_dir = node.directory
            if node_dir is not None:
                try:
                    rel_dir = node_dir.relative_to(repo_root)
                except ValueError:
                    rel_dir = node_dir
                path = f"{rel_dir.as_posix()}/corpus/{filename}"
            else:
                path = f"corpus/{filename}"
            entries.append(ReferenceEntry(file=filename, source=node.id, path=path))
    return entries


def compose(store: Store, target_id: str, tokenizer: Optional[Tokenizer] = None) -> ComposedNode:
    """Compose the effective context for ``target_id``."""
    if tokenizer is None:
        tokenizer = default_tokenizer()

    target = store.get(target_id)
    chain = store.parent_chain(target_id)
    kind_set = set(target.kind)

    acc: Dict[str, _Acc] = {}
    for node in chain:
        for d in node.directives:
            if not _applies(d, kind_set):
                continue
            _apply_directive(acc, d)

    effective: List[EffectiveDirective] = []
    for key in sorted(acc.keys()):
        entry = acc[key]
        if entry.suppressed:
            continue
        effective.append(
            EffectiveDirective(
                key=key,
                text="\n\n".join(entry.texts),
                applies_to=list(entry.applies_to),
                lang=entry.lang,
                sources=list(entry.sources),
            )
        )

    reference = _accumulate_reference(chain, store.repo_root)

    directive_text = "".join(ed.text for ed in effective)
    token_count = tokenizer.count(directive_text)
    reference_tokens = _reference_token_count(reference, store.repo_root, tokenizer)

    return ComposedNode(
        id=target.id,
        name=target.name,
        component=target.component,
        kind=list(target.kind),
        status=target.status,
        owner=list(target.owner),
        result=target.result,
        depends_on=list(target.depends_on),
        hito=target.hito,
        due_month=target.due_month,
        chain=[n.id for n in chain],
        directives=effective,
        reference=reference,
        token_estimate={
            "directives": token_count,
            "reference": reference_tokens,
            "total": token_count + reference_tokens,
            "method": tokenizer.name,
        },
    )


def _reference_token_count(
    reference: List[ReferenceEntry], repo_root, tokenizer: Tokenizer
) -> int:
    """Token count of the accumulated corpus documents' contents.

    Reference context is fetched via RAG rather than inlined, so these tokens
    are informational — reported next to the directive count, not instead of it.
    """
    total = 0
    for entry in reference:
        try:
            text = (repo_root / entry.path).read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        total += tokenizer.count(text)
    return total

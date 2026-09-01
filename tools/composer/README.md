# infotp_composer

Composition engine for **InfoTP Context Studio** — the git-first, self-hosted
context store described in `AGENTS.md` (D1–D10). It walks the cascading
Project → Component → Deliverable tree, composes directives ("most-specific
node wins per key", filtered by node `kind`), unions reference corpora up the
chain, and emits `.composed/<ID>.json` + `.composed/<ID>.md`.

## Install

```bash
pip install -e tools/composer
# with dev/test dependencies:
pip install -e "tools/composer[dev]"
```

## Run tests

```bash
cd tools/composer
pytest --cov=infotp_composer --cov-report=term-missing
```

## CLI usage

```bash
# Compose a single node (defaults: --repo auto-discovered, --out <repo>/.composed)
python -m infotp_composer compose C4P3

# Compose every node in the store
python -m infotp_composer compose --all

# CI staleness gate: fail if .composed/ is out of date (ignores composed_at)
python -m infotp_composer compose --check
```

`--repo PATH` overrides the auto-discovered repo root (found by walking up
from CWD looking for a directory containing both `schemas/` and `project/`).
`--out PATH` overrides the output directory (default `<repo>/.composed`).

// Resolve which Python interpreter the composer/RAG CLIs run under.
//
// Precedence:
//   1. STUDIO_PYTHON, if set (explicit override always wins).
//   2. A virtualenv committed at the repo root — <repo>/.venv or <repo>/venv —
//      which is where the documented `uv venv` setup lands. Auto-discovering it
//      removes the common footgun of the env var not reaching the server child
//      and falling back to a system python without the packages installed.
//   3. "python3" on PATH, as a last resort.
//
// Copied verbatim from tools/studio/server/src/python.ts per CONTRACT.md §1.1.

import { existsSync } from "node:fs";
import { join } from "node:path";

const VENV_DIRS = [".venv", "venv"] as const;

export function resolvePythonBin(repoRoot: string): string {
  const override = process.env.STUDIO_PYTHON;
  if (override) return override;

  for (const dir of VENV_DIRS) {
    const candidate = join(repoRoot, dir, "bin", "python");
    if (existsSync(candidate)) return candidate;
  }

  return "python3";
}

// Integration test against the REAL Python CLIs (no mocking). Skips
// gracefully if the repo's .venv is absent, per CONTRACT.md §8.
//
// Re-asserts the P3 security property (branch-scoped retrieval) at the MCP
// layer: a query scoped to C1P1 returns >=1 result, and the identical query
// text scoped to a sibling branch (C2) returns 0 results.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverRepoRoot } from "../src/repo.js";
import { loadCatalog } from "../src/catalog.js";
import { search } from "../src/rag.js";

const REPO_ROOT = discoverRepoRoot();
const VENV_PYTHON = join(REPO_ROOT, ".venv", "bin", "python");
const hasVenv = existsSync(VENV_PYTHON);

describe.skipIf(!hasVenv)("branch isolation (real infotp_rag)", () => {
  it("C1P1 query returns >=1 result", async () => {
    const catalog = loadCatalog(REPO_ROOT);
    if (!catalog.has("C1P1")) return; // fixture-only repo, nothing to assert
    const outcome = await search(REPO_ROOT, "C1P1", "GTFS realtime", 5, "hashing");
    expect(outcome.results.length).toBeGreaterThanOrEqual(1);
  });

  it("the same query text scoped to a sibling C2 branch returns 0 results", async () => {
    const catalog = loadCatalog(REPO_ROOT);
    if (!catalog.has("C2")) return;
    const outcome = await search(REPO_ROOT, "C2", "GTFS realtime", 5, "hashing");
    expect(outcome.results.length).toBe(0);
  });
});

// Repo-root discovery for the InfoTP context tree.
//
// Mirrors the composer's own discovery rule (tools/composer/infotp_composer/cli.py
// discover_repo_root): walk up from a starting directory looking for one that
// contains both schemas/ and project/.
//
// Copied from tools/studio/server/src/repo.ts per CONTRACT.md §1.1, trimmed to
// the read-only subset this server needs, plus INFOTP_REPO as an accepted env
// alias tried before STUDIO_REPO (§6).

import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export class RepoDiscoveryError extends Error {}

function looksLikeRepoRoot(dir: string): boolean {
  return (
    existsSync(join(dir, "schemas")) &&
    statSync(join(dir, "schemas")).isDirectory() &&
    existsSync(join(dir, "project")) &&
    statSync(join(dir, "project")).isDirectory()
  );
}

/**
 * Resolve the context repo root: explicit arg > INFOTP_REPO env >
 * STUDIO_REPO env > walk up from process.cwd() looking for schemas/ + project/.
 */
export function discoverRepoRoot(explicit?: string): string {
  if (explicit) {
    const abs = resolve(explicit);
    if (!looksLikeRepoRoot(abs)) {
      throw new RepoDiscoveryError(
        `--repo ${abs} does not contain both schemas/ and project/`,
      );
    }
    return abs;
  }

  for (const envVar of ["INFOTP_REPO", "STUDIO_REPO"] as const) {
    const fromEnv = process.env[envVar];
    if (fromEnv) {
      const abs = resolve(fromEnv);
      if (!looksLikeRepoRoot(abs)) {
        throw new RepoDiscoveryError(
          `${envVar}=${abs} does not contain both schemas/ and project/`,
        );
      }
      return abs;
    }
  }

  let current = resolve(process.cwd());
  while (true) {
    if (looksLikeRepoRoot(current)) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  throw new RepoDiscoveryError(
    "Could not discover repo root: no ancestor directory contains both " +
      "schemas/ and project/. Pass --repo or set INFOTP_REPO/STUDIO_REPO.",
  );
}

export function composedDir(repoRoot: string): string {
  return join(repoRoot, ".composed");
}

export function composedJsonPath(repoRoot: string, id: string): string {
  return join(composedDir(repoRoot), `${id}.json`);
}

export function composedMdPath(repoRoot: string, id: string): string {
  return join(composedDir(repoRoot), `${id}.md`);
}

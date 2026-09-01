// Repo-root discovery and path helpers for the InfoTP context tree.
//
// Mirrors the composer's own discovery rule (tools/composer/infotp_composer/cli.py
// discover_repo_root): walk up from a starting directory looking for one that
// contains both schemas/ and project/.

import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Layer } from "./types.js";

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
 * Resolve the context repo root: explicit arg > STUDIO_REPO env > walk up
 * from process.cwd() looking for schemas/ + project/.
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

  const fromEnv = process.env.STUDIO_REPO;
  if (fromEnv) {
    const abs = resolve(fromEnv);
    if (!looksLikeRepoRoot(abs)) {
      throw new RepoDiscoveryError(
        `STUDIO_REPO=${abs} does not contain both schemas/ and project/`,
      );
    }
    return abs;
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
      "schemas/ and project/. Pass --repo or set STUDIO_REPO.",
  );
}

/** The deliverable id's parent component, from its C#P# id shape (fallback only). */
export function componentIdFromDeliverableId(id: string): string {
  const m = /^(.*?)P\d+$/.exec(id);
  return m ? m[1] : id;
}

export interface NodeLocation {
  id: string;
  layer: Layer;
  dir: string;
}

/** Directory for the project node. */
export function projectDir(repoRoot: string): string {
  return join(repoRoot, "project");
}

/** Directory for a component node, e.g. componentDir(root, "C4"). */
export function componentDir(repoRoot: string, componentId: string): string {
  return join(repoRoot, "components", componentId);
}

/** Directory for a deliverable node, e.g. deliverableDir(root, "C4", "C4P3"). */
export function deliverableDir(
  repoRoot: string,
  componentId: string,
  deliverableId: string,
): string {
  return join(repoRoot, "components", componentId, "deliverables", deliverableId);
}

export function nodeYamlPath(dir: string): string {
  return join(dir, "node.yaml");
}

export function directivesYamlPath(dir: string): string {
  return join(dir, "directives.yaml");
}

/** The prose file name for a given layer, per CONTRACT.md. */
export function proseFileName(layer: Layer): string {
  if (layer === "project") return "brief.md";
  if (layer === "component") return "charter.md";
  return "reference.md";
}

export function proseFilePath(dir: string, layer: Layer): string {
  return join(dir, proseFileName(layer));
}

export function corpusDir(dir: string): string {
  return join(dir, "corpus");
}

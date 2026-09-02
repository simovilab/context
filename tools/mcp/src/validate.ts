// Input validation (security boundary, CONTRACT.md §5). Applied before any
// file read or spawn. Never construct a path or spawn argument from an
// unvalidated node_id.

import type { CatalogEntry } from "./types.js";

const NODE_ID_PATTERN = /^(project|C[1-7]|C[1-7]P[0-9]{1,2}|INF[1-3])$/;

export const MAX_QUERY_LENGTH = 2000;
export const DEFAULT_K = 5;
export const MIN_K = 1;
export const MAX_K = 20;

export class ValidationError extends Error {}

/**
 * `node_id` must match the shape allow-list AND be a member of the catalog.
 * Both checks run before any file read or spawn using the id.
 */
export function validateNodeId(
  nodeId: string,
  catalog: ReadonlyMap<string, CatalogEntry>,
): string {
  if (!NODE_ID_PATTERN.test(nodeId)) {
    throw new ValidationError(`Invalid node id: "${nodeId}"`);
  }
  if (!catalog.has(nodeId)) {
    throw new ValidationError(`Unknown node id: "${nodeId}"`);
  }
  return nodeId;
}

/** `query`: non-empty after trim, length <= 2000. */
export function validateQuery(query: string): string {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    throw new ValidationError("Query must not be empty");
  }
  if (query.length > MAX_QUERY_LENGTH) {
    throw new ValidationError(`Query too long (max ${MAX_QUERY_LENGTH} characters)`);
  }
  return query;
}

/** `k`: integer, clamped to [1, 20]. */
export function clampK(k: number | undefined): number {
  if (k === undefined) return DEFAULT_K;
  const rounded = Math.trunc(k);
  return Math.min(MAX_K, Math.max(MIN_K, rounded));
}

/**
 * Sanitize an agent-facing error message: a short reason only — never a
 * stack trace, never an absolute filesystem path, never raw CLI stderr
 * beyond a trimmed first line. Full detail is logged to stderr separately.
 */
export function sanitizeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const firstLine = raw.split("\n")[0] ?? raw;
  // Strip anything that looks like an absolute filesystem path.
  const withoutPaths = firstLine.replace(/\/[^\s"']+/g, "<path>");
  return withoutPaths.slice(0, 300);
}

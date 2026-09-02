// Data shapes mirrored from tools/mcp/CONTRACT.md and tools/studio/CONTRACT.md.
// Keep in lockstep with those files — they are the single source of truth for
// this seam. Copied (trimmed to the read-only subset this server needs) from
// tools/studio/server/src/types.ts per CONTRACT.md §1.1.

export type Layer = "project" | "component" | "deliverable";
export type Kind = "software" | "data" | "docs" | "api" | "infra" | "research";
export type Status = "not-started" | "in-progress" | "blocked" | "done";
export type Tokenizer = "heuristic" | "tiktoken";
export type Lang = "en" | "es";
export type SearchEmbedder = "hashing" | "semantic";

export interface NodeResult {
  type: string;
  visibility: "public" | "internal" | "restricted";
}

export interface EffectiveDirective {
  key: string;
  text: string;
  applies_to: Kind[];
  lang: string;
  sources: string[];
}

export interface ComposedView {
  id: string;
  name: string;
  component: string | null;
  kind: Kind[];
  status: string;
  owner: string[];
  result: NodeResult | null;
  depends_on: string[];
  hito: string | null;
  due_month: number | null;
  chain: string[];
  directives: EffectiveDirective[];
  reference: { file: string; source: string; path: string }[];
  token_estimate: { directives: number; method: string };
}

export interface BudgetComponentEntry {
  component: string;
  worstLeaf: { id: string; tokens: number };
}

export interface BudgetReport {
  tokenBudget: number;
  components: BudgetComponentEntry[];
  overflows: string[];
}

/** A single ranked chunk from `infotp_rag query --json`. */
export interface RetrievedChunk {
  score: number;
  text: string;
  node_id: string;
  file: string;
  title: string | null;
  ordinal: number;
}

/** The MCP-visible catalog entry, derived from a committed `.composed/<id>.json`. */
export interface CatalogEntry {
  id: string;
  name: string;
  component: string | null;
  kind: Kind[];
  status: Status;
  hito: string | null;
  due_month: number | null;
  depends_on: string[];
  layer: Layer;
}

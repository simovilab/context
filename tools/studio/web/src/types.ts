// Mirrors the TS interfaces in tools/studio/CONTRACT.md — keep in sync.

export type Layer = "project" | "component" | "deliverable";
export type Kind = "software" | "data" | "docs" | "api" | "infra" | "research";
export type Op = "set" | "extend" | "suppress";
export type Status = "not-started" | "in-progress" | "blocked" | "done";
export type Visibility = "public" | "internal" | "restricted";
export type Hito = "A" | "B" | "C" | "D" | "E" | "F";
export type Lang = "en" | "es";

export const KINDS: Kind[] = ["software", "data", "docs", "api", "infra", "research"];
export const STATUSES: Status[] = ["not-started", "in-progress", "blocked", "done"];
export const HITOS: Hito[] = ["A", "B", "C", "D", "E", "F"];
export const OPS: Op[] = ["set", "extend", "suppress"];
export const LANGS: Lang[] = ["en", "es"];
export const VISIBILITIES: Visibility[] = ["public", "internal", "restricted"];

export interface Directive {
  key: string;
  op: Op;
  applies_to: Kind[];
  text?: string;
  lang?: Lang;
}

export interface NodeFields {
  id: string;
  name: string;
  component?: string;
  result?: { type: string; visibility: Visibility };
  status: Status;
  owner: string[];
  kind: Kind[];
  depends_on: string[];
  hito?: Hito;
  due_month?: number;
}

export interface TreeNode extends NodeFields {
  layer: Layer;
  parent: string | null;
  children: string[];
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
  result: object | null;
  depends_on: string[];
  hito: string | null;
  due_month: number | null;
  chain: string[];
  directives: EffectiveDirective[];
  reference: { file: string; source: string; path: string }[];
  token_estimate: { directives: number; reference: number; total: number; method: string };
}

export interface NodeDetail {
  id: string;
  layer: Layer;
  fields: NodeFields;
  localDirectives: Directive[];
  composed: ComposedView;
  referenceMd: string;
  proseFile: string;
  corpus: string[];
}

export interface TreeResponse {
  nodes: TreeNode[];
  roots: string[];
}

export type SearchEmbedder = "hashing" | "semantic";

export interface ConfigResponse {
  tokenBudget: number;
  tokenizer: "heuristic" | "tiktoken";
  repoRoot: string;
  searchEmbedder: SearchEmbedder;
}

// --- P3 (D10): per-node corpus + branch-scoped retrieval, tools/rag/CONTRACT.md ---

export interface CorpusEntry {
  file: string;
  title?: string;
  source?: string;
  license?: string;
  lang?: Lang;
}

export interface CorpusResponse {
  entries: CorpusEntry[];
}

export interface RetrievedChunk {
  score: number;
  text: string;
  node_id: string;
  file: string;
  title: string | null;
  ordinal: number;
}

export interface SearchResponse {
  embedder: string;
  results: RetrievedChunk[];
  fallback: boolean;
}

export interface BudgetComponentRow {
  component: string;
  worstLeaf: { id: string; tokens: number };
}

export interface BudgetResponse {
  tokenBudget: number;
  components: BudgetComponentRow[];
  overflows: string[];
}

export interface RecomposeResponse {
  recomposed: number;
}

export type BlastRadius = "project" | "component" | "leaf";

export type Envelope<T> = { ok: true; data: T } | { ok: false; error: string };

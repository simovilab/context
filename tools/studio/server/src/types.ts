// Data shapes mirrored from tools/studio/CONTRACT.md. Keep in lockstep with
// that file — it is the single source of truth for this seam.

export type Layer = "project" | "component" | "deliverable";
export type Kind = "software" | "data" | "docs" | "api" | "infra" | "research";
export type Op = "set" | "extend" | "suppress";
export type Status = "not-started" | "in-progress" | "blocked" | "done";
export type Hito = "A" | "B" | "C" | "D" | "E" | "F";
export type Tokenizer = "heuristic" | "tiktoken";

export interface Directive {
  key: string;
  op: Op;
  applies_to: Kind[];
  text?: string;
  lang?: "en" | "es";
}

export interface NodeResult {
  type: string;
  visibility: "public" | "internal" | "restricted";
}

export interface NodeFields {
  id: string;
  name: string;
  component?: string;
  result?: NodeResult;
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
  result: NodeResult | null;
  depends_on: string[];
  hito: string | null;
  due_month: number | null;
  chain: string[];
  directives: EffectiveDirective[];
  reference: { file: string; source: string; path: string }[];
  token_estimate: { directives: number; method: string };
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

export interface BudgetComponentEntry {
  component: string;
  worstLeaf: { id: string; tokens: number };
}

export interface BudgetReport {
  tokenBudget: number;
  components: BudgetComponentEntry[];
  overflows: string[];
}

export type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: string };

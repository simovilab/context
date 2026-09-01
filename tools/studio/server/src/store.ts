// Reads and writes the git context tree: node.yaml, directives.yaml, and the
// per-layer prose file. The composer remains authoritative for validation and
// composition — this module only does plain file IO plus enough structure to
// answer "what nodes exist" and "what does this one node look like".

import { readdirSync, existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  componentDir,
  corpusDir,
  deliverableDir,
  directivesYamlPath,
  nodeYamlPath,
  projectDir,
  proseFileName,
  proseFilePath,
} from "./repo.js";
import type { Directive, Layer, NodeFields, TreeNode } from "./types.js";

function listSubdirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

async function readYamlFile(path: string): Promise<Record<string, unknown>> {
  const raw = await readFile(path, "utf-8");
  const data = parseYaml(raw);
  return (data ?? {}) as Record<string, unknown>;
}

function toNodeFields(raw: Record<string, unknown>): NodeFields {
  return {
    id: raw.id as string,
    name: raw.name as string,
    component: raw.component as string | undefined,
    result: raw.result as NodeFields["result"],
    status: (raw.status as NodeFields["status"]) ?? "not-started",
    owner: (raw.owner as string[]) ?? [],
    kind: (raw.kind as NodeFields["kind"]) ?? [],
    depends_on: (raw.depends_on as string[]) ?? [],
    hito: raw.hito as NodeFields["hito"],
    due_month: raw.due_month as number | undefined,
  };
}

interface DirEntry {
  id: string;
  layer: Layer;
  dir: string;
  parent: string | null;
}

/** Enumerate every node directory in the tree, in project -> components -> deliverables order. */
function enumerateNodeDirs(repoRoot: string): DirEntry[] {
  const entries: DirEntry[] = [];

  const pDir = projectDir(repoRoot);
  if (existsSync(nodeYamlPath(pDir))) {
    entries.push({ id: "project", layer: "project", dir: pDir, parent: null });
  }

  const componentsRoot = join2(repoRoot, "components");
  for (const cId of listSubdirs(componentsRoot)) {
    const cDir = componentDir(repoRoot, cId);
    if (!existsSync(nodeYamlPath(cDir))) continue;
    entries.push({ id: cId, layer: "component", dir: cDir, parent: "project" });

    const deliverablesRoot = join2(cDir, "deliverables");
    for (const dId of listSubdirs(deliverablesRoot)) {
      const dDir = deliverableDir(repoRoot, cId, dId);
      if (!existsSync(nodeYamlPath(dDir))) continue;
      entries.push({ id: dId, layer: "deliverable", dir: dDir, parent: cId });
    }
  }

  return entries;
}

function join2(...parts: string[]): string {
  return parts.join("/");
}

/** Read every node.yaml in the tree and assemble TreeNode[] with parent/children. */
export async function readTree(repoRoot: string): Promise<TreeNode[]> {
  const dirEntries = enumerateNodeDirs(repoRoot);
  const childrenByParent = new Map<string, string[]>();
  for (const e of dirEntries) {
    if (e.parent) {
      const list = childrenByParent.get(e.parent) ?? [];
      list.push(e.id);
      childrenByParent.set(e.parent, list);
    }
  }

  const nodes: TreeNode[] = [];
  for (const e of dirEntries) {
    const raw = await readYamlFile(nodeYamlPath(e.dir));
    const fields = toNodeFields(raw);
    nodes.push({
      ...fields,
      layer: e.layer,
      parent: e.parent,
      children: childrenByParent.get(e.id) ?? [],
    });
  }
  return nodes;
}

/** Locate a single node's directory + layer by id, by scanning the tree. */
export async function findNodeDir(
  repoRoot: string,
  id: string,
): Promise<{ dir: string; layer: Layer } | null> {
  const dirEntries = enumerateNodeDirs(repoRoot);
  const match = dirEntries.find((e) => e.id === id);
  if (!match) return null;
  return { dir: match.dir, layer: match.layer };
}

export interface NodeFileData {
  layer: Layer;
  dir: string;
  fields: NodeFields;
  localDirectives: Directive[];
  referenceMd: string;
  proseFile: string;
  corpus: string[];
}

/** Read node.yaml + directives.yaml + prose + corpus listing for a single node. */
export async function readNodeFiles(
  repoRoot: string,
  id: string,
): Promise<NodeFileData | null> {
  const loc = await findNodeDir(repoRoot, id);
  if (!loc) return null;
  const { dir, layer } = loc;

  const raw = await readYamlFile(nodeYamlPath(dir));
  const fields = toNodeFields(raw);

  let localDirectives: Directive[] = [];
  const dPath = directivesYamlPath(dir);
  if (existsSync(dPath)) {
    const dRaw = await readYamlFile(dPath);
    localDirectives = ((dRaw.directives as Directive[]) ?? []).map((d) => ({
      key: d.key,
      op: d.op,
      applies_to: d.applies_to,
      text: d.text,
      lang: d.lang ?? "en",
    }));
  }

  const proseFile = proseFileName(layer);
  const prosePath = proseFilePath(dir, layer);
  let referenceMd = "";
  if (existsSync(prosePath)) {
    referenceMd = await readFile(prosePath, "utf-8");
  }

  const cDir = corpusDir(dir);
  let corpus: string[] = [];
  if (existsSync(cDir)) {
    corpus = readdirSync(cDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name !== ".gitkeep")
      .map((e) => e.name)
      .sort();
  }

  return { layer, dir, fields, localDirectives, referenceMd, proseFile, corpus };
}

/**
 * Merge `patch` onto the existing node.yaml (preserving the file's key order
 * for keys that already exist; new keys are appended in schema order) and
 * write it back.
 */
export async function writeNodeFields(
  repoRoot: string,
  id: string,
  patch: Partial<NodeFields>,
): Promise<void> {
  const loc = await findNodeDir(repoRoot, id);
  if (!loc) throw new Error(`Unknown node id: ${id}`);
  const path = nodeYamlPath(loc.dir);

  const existing = existsSync(path) ? await readYamlFile(path) : {};
  const merged: Record<string, unknown> = { ...existing };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    merged[key] = value;
  }

  // Canonical key order matching schemas/node.schema.json / real node.yaml files.
  const order = [
    "id",
    "name",
    "component",
    "result",
    "status",
    "owner",
    "kind",
    "depends_on",
    "directives",
    "corpus",
    "hito",
    "due_month",
  ];
  const ordered: Record<string, unknown> = {};
  for (const key of order) {
    if (merged[key] !== undefined) ordered[key] = merged[key];
  }
  for (const key of Object.keys(merged)) {
    if (!(key in ordered)) ordered[key] = merged[key];
  }

  // indentSeq:false matches the repo's block-sequence style (`- x`, not `  - x`),
  // so studio saves produce clean diffs in this git-first store.
  await writeFile(path, stringifyYaml(ordered, { indentSeq: false }), "utf-8");
}

/** Overwrite this node's directives.yaml from a Directive[] (version: 1 wrapper). */
export async function writeLocalDirectives(
  repoRoot: string,
  id: string,
  directives: Directive[],
): Promise<void> {
  const loc = await findNodeDir(repoRoot, id);
  if (!loc) throw new Error(`Unknown node id: ${id}`);
  const path = directivesYamlPath(loc.dir);

  const cleaned = directives.map((d) => {
    const out: Record<string, unknown> = {
      key: d.key,
      op: d.op,
      applies_to: d.applies_to,
    };
    if (d.op !== "suppress") {
      out.text = d.text ?? "";
    } else if (d.text !== undefined) {
      out.text = d.text;
    }
    out.lang = d.lang ?? "en";
    return out;
  });

  const doc = { version: 1, directives: cleaned };
  await writeFile(path, stringifyYaml(doc, { indentSeq: false }), "utf-8");
}

/** Overwrite this node's prose file (reference.md / charter.md / brief.md). */
export async function writeProseFile(
  repoRoot: string,
  id: string,
  content: string,
): Promise<void> {
  const loc = await findNodeDir(repoRoot, id);
  if (!loc) throw new Error(`Unknown node id: ${id}`);
  if (!existsSync(loc.dir)) mkdirSync(loc.dir, { recursive: true });
  const path = proseFilePath(loc.dir, loc.layer);
  await writeFile(path, content, "utf-8");
}

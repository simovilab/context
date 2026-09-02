// The node catalog (D4 boundary): derived by reading every committed
// `<repo>/.composed/*.json` artifact once at startup. This is the
// language-neutral contract boundary — no node.yaml parsing in TS, no Python
// needed to list or validate. It is also the id-validation allow-list (§5).
//
// The process is short-lived per agent session, so no watch/reload is
// required or provided.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CatalogEntry, ComposedView, Layer, Status } from "./types.js";

export class CatalogError extends Error {}

function deriveLayer(id: string): Layer {
  if (id === "project") return "project";
  if (/^C[1-7]$/.test(id)) return "component";
  return "deliverable";
}

function toCatalogEntry(view: ComposedView): CatalogEntry {
  return {
    id: view.id,
    name: view.name,
    component: view.component,
    kind: view.kind,
    status: view.status as Status,
    hito: view.hito,
    due_month: view.due_month,
    depends_on: view.depends_on,
    layer: deriveLayer(view.id),
  };
}

/** Read every `.composed/*.json` into an immutable `id -> CatalogEntry` map. */
export function loadCatalog(repoRoot: string): ReadonlyMap<string, CatalogEntry> {
  const composedDir = join(repoRoot, ".composed");
  let filenames: string[];
  try {
    filenames = readdirSync(composedDir).filter((name) => name.endsWith(".json"));
  } catch (err) {
    throw new CatalogError(
      `Could not read ${composedDir}: ${(err as Error).message} — run ` +
        "\`infotp_composer compose --all\` first.",
    );
  }

  if (filenames.length === 0) {
    throw new CatalogError(
      "No composed artifacts found — run \`infotp_composer compose --all\` first.",
    );
  }

  const entries = new Map<string, CatalogEntry>();
  for (const filename of filenames) {
    const filePath = join(composedDir, filename);
    let raw: string;
    try {
      raw = readFileSync(filePath, "utf-8");
    } catch (err) {
      throw new CatalogError(`Could not read ${filePath}: ${(err as Error).message}`);
    }
    let parsed: ComposedView;
    try {
      parsed = JSON.parse(raw) as ComposedView;
    } catch (err) {
      throw new CatalogError(`Invalid JSON in ${filePath}: ${(err as Error).message}`);
    }
    entries.set(parsed.id, toCatalogEntry(parsed));
  }

  return entries;
}

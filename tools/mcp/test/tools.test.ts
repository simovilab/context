import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogEntry } from "../src/types.js";
import type { ServerConfig } from "../src/config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_REPO = join(__dirname, "fixtures", "repo");

// Capture every spawn() call's (command, args) and let each test script the
// fake child's stdout/exit code. No real Python process is ever started.
const spawnCalls: { command: string; args: string[] }[] = [];
let nextStdout = "";
let nextExitCode = 0;

vi.mock("node:child_process", () => ({
  spawn: vi.fn((command: string, args: string[]) => {
    spawnCalls.push({ command, args });
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    queueMicrotask(() => {
      if (nextStdout) child.stdout.emit("data", Buffer.from(nextStdout));
      child.emit("close", nextExitCode);
    });
    return child;
  }),
}));

const { makeGetBudgetHandler, makeGetDirectivesHandler, makeListNodesHandler, makeSearchReferenceHandler } =
  await import("../src/tools.js");

function catalogWith(entries: Partial<CatalogEntry>[]): ReadonlyMap<string, CatalogEntry> {
  const map = new Map<string, CatalogEntry>();
  for (const partial of entries) {
    const entry: CatalogEntry = {
      id: "X",
      name: "X",
      component: null,
      kind: [],
      status: "in-progress",
      hito: null,
      due_month: null,
      depends_on: [],
      layer: "deliverable",
      ...partial,
    };
    map.set(entry.id, entry);
  }
  return map;
}

const config: ServerConfig = {
  repoRoot: FIXTURE_REPO,
  defaultEmbedder: "semantic",
  defaultTokenizer: "heuristic",
};

beforeEach(() => {
  spawnCalls.length = 0;
  nextStdout = "";
  nextExitCode = 0;
});

describe("list_nodes handler", () => {
  const catalog = catalogWith([
    { id: "project", layer: "project" },
    { id: "C1", layer: "component", component: "C1" },
    { id: "C1P1", layer: "deliverable", component: "C1" },
  ]);

  it("returns the full catalog, sorted by id, with no spawn", async () => {
    const handler = makeListNodesHandler(catalog);
    const result = await handler({});
    expect(spawnCalls).toHaveLength(0);
    const nodes = result.structuredContent?.nodes as CatalogEntry[];
    expect(nodes.map((n) => n.id)).toEqual(["C1", "C1P1", "project"]);
  });

  it("filters by layer", async () => {
    const handler = makeListNodesHandler(catalog);
    const result = await handler({ layer: "component" });
    const nodes = result.structuredContent?.nodes as CatalogEntry[];
    expect(nodes.map((n) => n.id)).toEqual(["C1"]);
  });

  it("filters by component", async () => {
    const handler = makeListNodesHandler(catalog);
    const result = await handler({ component: "C1" });
    const nodes = result.structuredContent?.nodes as CatalogEntry[];
    expect(nodes.map((n) => n.id).sort()).toEqual(["C1", "C1P1"]);
  });
});

describe("get_directives handler", () => {
  const catalog = catalogWith([{ id: "C1P1", layer: "deliverable", component: "C1" }]);

  it("reads the committed .composed/<id>.json by default (no spawn)", async () => {
    const handler = makeGetDirectivesHandler(catalog, config);
    const result = await handler({ node_id: "C1P1" });
    expect(spawnCalls).toHaveLength(0);
    expect(result.structuredContent?.id).toBe("C1P1");
    expect(result.isError).toBeUndefined();
  });

  it("shells to composer compose --stdout --json when live:true", async () => {
    nextStdout = JSON.stringify({
      id: "C1P1",
      name: "x",
      component: "C1",
      kind: [],
      status: "in-progress",
      owner: [],
      result: null,
      depends_on: [],
      hito: null,
      due_month: null,
      chain: ["project", "C1", "C1P1"],
      directives: [],
      reference: [],
      token_estimate: { directives: 0, method: "heuristic" },
    });
    const handler = makeGetDirectivesHandler(catalog, config);
    const result = await handler({ node_id: "C1P1", live: true });
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0].args).toEqual(
      expect.arrayContaining(["compose", "C1P1", "--tokenizer", "heuristic", "--stdout", "--json"]),
    );
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent?.id).toBe("C1P1");
  });

  it("rejects an unknown node id without spawning", async () => {
    const handler = makeGetDirectivesHandler(catalog, config);
    const result = await handler({ node_id: "C9" });
    expect(spawnCalls).toHaveLength(0);
    expect(result.isError).toBe(true);
  });
});

describe("search_reference handler", () => {
  const catalog = catalogWith([{ id: "C1P1", layer: "deliverable", component: "C1" }]);

  it("forwards node_id unchanged to infotp_rag (branch-scoping delegated)", async () => {
    nextStdout = JSON.stringify({ ok: true, embedder: "hashing", node_id: "C1P1", k: 5, results: [] });
    const handler = makeSearchReferenceHandler(catalog, config);
    await handler({ node_id: "C1P1", query: "GTFS realtime", embedder: "hashing" });
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0].args).toEqual(
      expect.arrayContaining(["query", "C1P1", "GTFS realtime", "-k", "5", "--embedder", "hashing", "--json"]),
    );
  });

  it("clamps k into [1, 20]", async () => {
    nextStdout = JSON.stringify({ ok: true, embedder: "hashing", node_id: "C1P1", k: 20, results: [] });
    const handler = makeSearchReferenceHandler(catalog, config);
    await handler({ node_id: "C1P1", query: "x", k: 999, embedder: "hashing" });
    expect(spawnCalls[0].args).toEqual(expect.arrayContaining(["-k", "20"]));
  });

  it("shapes structuredContent as { embedder, fallback, results }", async () => {
    nextStdout = JSON.stringify({
      ok: true,
      embedder: "hashing",
      node_id: "C1P1",
      k: 5,
      results: [{ score: 0.5, text: "t", node_id: "C1P1", file: "f.md", title: "T", ordinal: 0 }],
    });
    const handler = makeSearchReferenceHandler(catalog, config);
    const result = await handler({ node_id: "C1P1", query: "x", embedder: "hashing" });
    expect(result.structuredContent).toEqual({
      embedder: "hashing",
      fallback: false,
      results: [{ score: 0.5, text: "t", node_id: "C1P1", file: "f.md", title: "T", ordinal: 0 }],
    });
  });

  it("rejects an empty query without spawning", async () => {
    const handler = makeSearchReferenceHandler(catalog, config);
    const result = await handler({ node_id: "C1P1", query: "   " });
    expect(spawnCalls).toHaveLength(0);
    expect(result.isError).toBe(true);
  });
});

describe("get_budget handler", () => {
  it("shells to composer budget --json with the configured tokenizer", async () => {
    nextStdout = JSON.stringify({ tokenBudget: 4000, components: [], overflows: [] });
    const handler = makeGetBudgetHandler(config);
    const result = await handler({});
    expect(spawnCalls[0].args).toEqual(expect.arrayContaining(["budget", "--tokenizer", "heuristic", "--json"]));
    expect(result.structuredContent).toEqual({ tokenBudget: 4000, components: [], overflows: [] });
  });
});

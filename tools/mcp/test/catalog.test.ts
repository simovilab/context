import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CatalogError, loadCatalog } from "../src/catalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_REPO = join(__dirname, "fixtures", "repo");

describe("loadCatalog", () => {
  it("reads every .composed/*.json into an id -> CatalogEntry map", () => {
    const catalog = loadCatalog(FIXTURE_REPO);
    expect(catalog.size).toBe(4);
    expect([...catalog.keys()].sort()).toEqual(["C1", "C1P1", "C2", "project"]);
  });

  it("derives layer: project for 'project'", () => {
    const catalog = loadCatalog(FIXTURE_REPO);
    expect(catalog.get("project")?.layer).toBe("project");
  });

  it("derives layer: component for C#", () => {
    const catalog = loadCatalog(FIXTURE_REPO);
    expect(catalog.get("C1")?.layer).toBe("component");
    expect(catalog.get("C2")?.layer).toBe("component");
  });

  it("derives layer: deliverable for C#P# (and would for INF#)", () => {
    const catalog = loadCatalog(FIXTURE_REPO);
    expect(catalog.get("C1P1")?.layer).toBe("deliverable");
  });

  it("carries through the documented CatalogEntry fields", () => {
    const catalog = loadCatalog(FIXTURE_REPO);
    const entry = catalog.get("C1P1");
    expect(entry).toEqual({
      id: "C1P1",
      name: "Deliverable 1 of C1",
      component: "C1",
      kind: ["docs"],
      status: "not-started",
      hito: "B",
      due_month: 3,
      depends_on: [],
      layer: "deliverable",
    });
  });

  it("fails fast when .composed/ is missing", () => {
    expect(() => loadCatalog(join(__dirname, "fixtures", "does-not-exist"))).toThrow(CatalogError);
  });

  it("fails fast when .composed/ is empty", () => {
    expect(() => loadCatalog(join(__dirname, "fixtures", "empty-repo"))).toThrow(CatalogError);
  });
});

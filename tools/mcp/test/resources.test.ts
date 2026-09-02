import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { loadCatalog } from "../src/catalog.js";
import { makeDirectivesResourceHandler, makeTreeResourceHandler } from "../src/resources.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_REPO = join(__dirname, "fixtures", "repo");

describe("context://tree", () => {
  it("returns the same payload shape as list_nodes", async () => {
    const catalog = loadCatalog(FIXTURE_REPO);
    const handler = makeTreeResourceHandler(catalog);
    const result = await handler(new URL("context://tree"));
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].mimeType).toBe("application/json");
    const parsed = JSON.parse(result.contents[0].text) as { nodes: { id: string }[] };
    expect(parsed.nodes.map((n) => n.id).sort()).toEqual(["C1", "C1P1", "C2", "project"]);
  });
});

describe("context://node/{id}/directives", () => {
  it("returns markdown for a known id", async () => {
    const catalog = loadCatalog(FIXTURE_REPO);
    const handler = makeDirectivesResourceHandler(catalog, FIXTURE_REPO);
    const result = await handler(new URL("context://node/C1P1/directives"), { id: "C1P1" });
    expect(result.contents[0].mimeType).toBe("text/markdown");
    expect(result.contents[0].text).toContain("C1P1");
  });

  it("throws McpError for an unknown id", async () => {
    const catalog = loadCatalog(FIXTURE_REPO);
    const handler = makeDirectivesResourceHandler(catalog, FIXTURE_REPO);
    await expect(handler(new URL("context://node/C9/directives"), { id: "C9" })).rejects.toBeInstanceOf(McpError);
  });

  it("throws McpError for a malformed id", async () => {
    const catalog = loadCatalog(FIXTURE_REPO);
    const handler = makeDirectivesResourceHandler(catalog, FIXTURE_REPO);
    await expect(
      handler(new URL("context://node/c1p1/directives"), { id: "c1p1" }),
    ).rejects.toBeInstanceOf(McpError);
  });
});

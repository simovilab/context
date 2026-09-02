// MCP tool registrations (CONTRACT.md §3). Every handler returns
// `{ content: [{ type: "text", text }], structuredContent }` on success and
// `{ content: [{ type: "text", text }], isError: true }` on failure, with
// agent-facing error text sanitized (§5).
//
// Handler bodies are exported as `make*Handler` factories (not just
// registered inline) so tests can invoke them directly against a mocked
// spawn, without standing up a full McpServer + transport.

import { readFileSync } from "node:fs";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { budget, composeStdout } from "./composer.js";
import { search } from "./rag.js";
import { composedJsonPath } from "./repo.js";
import type { ServerConfig } from "./config.js";
import type { CatalogEntry, ComposedView, Layer } from "./types.js";
import { clampK, sanitizeErrorMessage, validateNodeId, validateQuery } from "./validate.js";

export type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

function errorResult(err: unknown): ToolResult {
  return {
    content: [{ type: "text", text: `Error: ${sanitizeErrorMessage(err)}` }],
    isError: true,
  };
}

function sortedEntries(catalog: ReadonlyMap<string, CatalogEntry>): CatalogEntry[] {
  return [...catalog.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function makeListNodesHandler(catalog: ReadonlyMap<string, CatalogEntry>) {
  return async ({ layer, component }: { layer?: Layer; component?: string }): Promise<ToolResult> => {
    const nodes = sortedEntries(catalog).filter((entry) => {
      if (layer && entry.layer !== layer) return false;
      if (component && entry.component !== component) return false;
      return true;
    });
    return {
      content: [{ type: "text", text: `${nodes.length} node(s)` }],
      structuredContent: { nodes },
    };
  };
}

export function makeGetDirectivesHandler(
  catalog: ReadonlyMap<string, CatalogEntry>,
  config: ServerConfig,
) {
  return async ({ node_id, live }: { node_id: string; live?: boolean }): Promise<ToolResult> => {
    try {
      const id = validateNodeId(node_id, catalog);
      const view: ComposedView = live
        ? await composeStdout(config.repoRoot, id, config.defaultTokenizer)
        : (JSON.parse(readFileSync(composedJsonPath(config.repoRoot, id), "utf-8")) as ComposedView);
      const text =
        `${view.id} — ${view.directives.length} directives, ` +
        `~${view.token_estimate.directives} tok (${view.token_estimate.method}); ` +
        `chain: ${view.chain.join(" → ")}`;
      return { content: [{ type: "text", text }], structuredContent: view as unknown as Record<string, unknown> };
    } catch (err) {
      return errorResult(err);
    }
  };
}

export function makeSearchReferenceHandler(
  catalog: ReadonlyMap<string, CatalogEntry>,
  config: ServerConfig,
) {
  return async ({
    node_id,
    query,
    k,
    embedder,
  }: {
    node_id: string;
    query: string;
    k?: number;
    embedder?: "hashing" | "semantic";
  }): Promise<ToolResult> => {
    try {
      const id = validateNodeId(node_id, catalog);
      const text = validateQuery(query);
      const clampedK = clampK(k);
      const chosenEmbedder = embedder ?? config.defaultEmbedder;
      const outcome = await search(config.repoRoot, id, text, clampedK, chosenEmbedder);
      const summary =
        `${outcome.results.length} chunk(s) via ${outcome.embedder}` +
        `${outcome.fallback ? " (fallback)" : ""} for "${text}" scoped to ${id}`;
      return {
        content: [{ type: "text", text: summary }],
        structuredContent: {
          embedder: outcome.embedder,
          fallback: outcome.fallback,
          results: outcome.results,
        },
      };
    } catch (err) {
      return errorResult(err);
    }
  };
}

export function makeGetBudgetHandler(config: ServerConfig) {
  return async ({ tokenizer }: { tokenizer?: "heuristic" | "tiktoken" }): Promise<ToolResult> => {
    try {
      const report = await budget(config.repoRoot, tokenizer ?? config.defaultTokenizer);
      const overflowText =
        report.overflows.length > 0
          ? `${report.overflows.length} overflow(s): ${report.overflows.join(", ")}`
          : "no overflows";
      const text = `Budget ${report.tokenBudget} tok; ${overflowText}`;
      return {
        content: [{ type: "text", text }],
        structuredContent: report as unknown as Record<string, unknown>,
      };
    } catch (err) {
      return errorResult(err);
    }
  };
}

export function registerTools(
  server: McpServer,
  catalog: ReadonlyMap<string, CatalogEntry>,
  config: ServerConfig,
): void {
  server.registerTool(
    "list_nodes",
    {
      title: "List context nodes",
      description:
        "List the InfoTP context node catalog (project / component / deliverable layers), " +
        "optionally filtered by layer and/or component.",
      inputSchema: {
        layer: z.enum(["project", "component", "deliverable"]).optional(),
        component: z.string().optional(),
      },
    },
    makeListNodesHandler(catalog),
  );

  server.registerTool(
    "get_directives",
    {
      title: "Get directive context",
      description:
        "Get the composed, specificity-resolved, token-budgeted directive block for a node. " +
        "By default reads the committed .composed/<id>.json; pass live:true to recompute " +
        "from the current working tree.",
      inputSchema: {
        node_id: z.string(),
        live: z.boolean().optional(),
      },
    },
    makeGetDirectivesHandler(catalog, config),
  );

  server.registerTool(
    "search_reference",
    {
      title: "Search reference corpus",
      description:
        "Branch-scoped retrieval over a node's accumulated reference corpus. An agent scoped " +
        "to a deliverable can only retrieve project/component/deliverable corpus on its own " +
        "chain — never a sibling branch. Scoping is enforced inside infotp_rag.",
      inputSchema: {
        node_id: z.string(),
        query: z.string(),
        k: z.number().int().optional(),
        embedder: z.enum(["hashing", "semantic"]).optional(),
      },
    },
    makeSearchReferenceHandler(catalog, config),
  );

  server.registerTool(
    "get_budget",
    {
      title: "Get token budget report",
      description:
        "Get the per-branch worst-case-leaf token budget report and any overflowing nodes.",
      inputSchema: {
        tokenizer: z.enum(["heuristic", "tiktoken"]).optional(),
      },
    },
    makeGetBudgetHandler(config),
  );
}

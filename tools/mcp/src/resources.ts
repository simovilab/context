// MCP resource registrations (CONTRACT.md §4).
//
// The contract names `ResourceNotFoundError` and
// `ProtocolError(ProtocolErrorCode.InvalidParams, ...)` as the preferred typed
// errors. Neither is exported by the installed SDK (@modelcontextprotocol/sdk
// 1.30.0) — grepped node_modules/@modelcontextprotocol/sdk/dist/esm for both
// names and found no such exports. Per the contract's own fallback
// instruction ("if they are not exported ... fall back ... but PREFER the
// typed errors"), this uses the SDK's actual exported typed error,
// `McpError` from "@modelcontextprotocol/sdk/types.js", with
// `ErrorCode.InvalidParams` for both the malformed-id and unknown-id cases
// (the JSON-RPC ErrorCode enum has no dedicated "not found" code). This is
// flagged in the implementation report as an interpretation of an ambiguous
// contract detail.
//
// Read callbacks are exported as `make*ResourceHandler` factories (not just
// registered inline) so tests can invoke them directly, without reaching
// into McpServer internals.

import { readFileSync } from "node:fs";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Variables } from "@modelcontextprotocol/sdk/shared/uriTemplate.js";
import { composedMdPath } from "./repo.js";
import type { CatalogEntry } from "./types.js";
import { validateNodeId, ValidationError } from "./validate.js";

interface ResourceContents {
  [key: string]: unknown;
  contents: { uri: string; mimeType: string; text: string }[];
}

function sortedEntries(catalog: ReadonlyMap<string, CatalogEntry>): CatalogEntry[] {
  return [...catalog.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function makeTreeResourceHandler(catalog: ReadonlyMap<string, CatalogEntry>) {
  return async (uri: URL): Promise<ResourceContents> => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify({ nodes: sortedEntries(catalog) }),
      },
    ],
  });
}

export function makeDirectivesResourceHandler(
  catalog: ReadonlyMap<string, CatalogEntry>,
  repoRoot: string,
) {
  return async (uri: URL, variables: Variables): Promise<ResourceContents> => {
    const rawValue = variables.id;
    const rawId = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    let validId: string;
    try {
      validId = validateNodeId(rawId, catalog);
    } catch (err) {
      if (err instanceof ValidationError && err.message.startsWith("Unknown node id")) {
        throw new McpError(ErrorCode.InvalidParams, `Resource not found: ${uri.href}`);
      }
      throw new McpError(ErrorCode.InvalidParams, `Invalid node id in ${uri.href}`);
    }

    let text: string;
    try {
      text = readFileSync(composedMdPath(repoRoot, validId), "utf-8");
    } catch {
      throw new McpError(ErrorCode.InvalidParams, `Resource not found: ${uri.href}`);
    }

    return {
      contents: [{ uri: uri.href, mimeType: "text/markdown", text }],
    };
  };
}

export function registerResources(
  server: McpServer,
  catalog: ReadonlyMap<string, CatalogEntry>,
  repoRoot: string,
): void {
  server.registerResource(
    "tree",
    "context://tree",
    { description: "The InfoTP context node catalog." },
    makeTreeResourceHandler(catalog),
  );

  server.registerResource(
    "directives",
    new ResourceTemplate("context://node/{id}/directives", { list: undefined }),
    { description: "The committed directive block for a node, as markdown." },
    makeDirectivesResourceHandler(catalog, repoRoot),
  );
}

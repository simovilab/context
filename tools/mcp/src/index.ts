#!/usr/bin/env node
// Entry point (CONTRACT.md §7). stdio is reserved for the JSON-RPC transport
// — all human logging goes to console.error (stderr).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadCatalog } from "./catalog.js";
import { loadConfig } from "./config.js";
import { resolvePythonBin } from "./python.js";
import { registerResources } from "./resources.js";
import { registerTools } from "./tools.js";

const SERVER_NAME = "infotp-context";
const SERVER_VERSION = "0.1.0";

async function main(): Promise<void> {
  const config = loadConfig();
  const catalog = loadCatalog(config.repoRoot);
  const pythonBin = resolvePythonBin(config.repoRoot);

  console.error(
    `[${SERVER_NAME}] v${SERVER_VERSION} — repo=${config.repoRoot} python=${pythonBin} ` +
      `nodes=${catalog.size} embedder=${config.defaultEmbedder} tokenizer=${config.defaultTokenizer}`,
  );

  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerTools(server, catalog, config);
  registerResources(server, catalog, config.repoRoot);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[${SERVER_NAME}] connected over stdio`);
}

main().catch((err: unknown) => {
  console.error(`[${SERVER_NAME}] fatal:`, err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

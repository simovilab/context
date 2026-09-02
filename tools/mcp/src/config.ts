// Server configuration resolved from env + optional CLI --repo arg, per
// CONTRACT.md §6.

import { discoverRepoRoot } from "./repo.js";
import type { SearchEmbedder, Tokenizer } from "./types.js";

export interface ServerConfig {
  repoRoot: string;
  defaultEmbedder: SearchEmbedder;
  defaultTokenizer: Tokenizer;
}

function readExplicitRepoArg(argv: readonly string[]): string | undefined {
  const flagIndex = argv.indexOf("--repo");
  if (flagIndex === -1) return undefined;
  return argv[flagIndex + 1];
}

function readEmbedderEnv(): SearchEmbedder {
  const value = process.env.INFOTP_MCP_EMBEDDER;
  return value === "hashing" || value === "semantic" ? value : "semantic";
}

function readTokenizerEnv(): Tokenizer {
  const value = process.env.INFOTP_MCP_TOKENIZER;
  return value === "heuristic" || value === "tiktoken" ? value : "heuristic";
}

export function loadConfig(argv: readonly string[] = process.argv.slice(2)): ServerConfig {
  const explicitRepo = readExplicitRepoArg(argv);
  return {
    repoRoot: discoverRepoRoot(explicitRepo),
    defaultEmbedder: readEmbedderEnv(),
    defaultTokenizer: readTokenizerEnv(),
  };
}

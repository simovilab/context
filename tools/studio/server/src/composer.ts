// Thin wrappers around the Python composer CLI (`python -m infotp_composer`).
// The composer is authoritative for composition, validation, and token
// estimates — this module never re-implements any of that; it only shells
// out and parses stdout/stderr per tools/studio/CONTRACT.md.

import { spawn } from "node:child_process";
import type { BudgetReport, ComposedView, Tokenizer } from "./types.js";

export class ComposerError extends Error {
  constructor(
    message: string,
    public readonly stderr: string,
    public readonly exitCode: number | null,
  ) {
    super(message);
    this.name = "ComposerError";
  }
}

function pythonBin(): string {
  return process.env.STUDIO_PYTHON || "python3";
}

function runComposer(repoRoot: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(pythonBin(), ["-m", "infotp_composer", ...args, "--repo", repoRoot], {
      cwd: repoRoot,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));

    child.on("error", (err) => {
      reject(new ComposerError(`Failed to spawn composer: ${err.message}`, "", null));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new ComposerError(
            `Composer exited with code ${code}: ${stderr.trim() || "(no stderr)"}`,
            stderr,
            code,
          ),
        );
        return;
      }
      resolvePromise({ stdout, stderr });
    });
  });
}

/** compose <id> --tokenizer <t> --stdout --json — parsed JSON, no file writes. */
export async function composeStdout(
  repoRoot: string,
  id: string,
  tokenizer: Tokenizer,
): Promise<ComposedView> {
  const { stdout } = await runComposer(repoRoot, [
    "compose",
    id,
    "--tokenizer",
    tokenizer,
    "--stdout",
    "--json",
  ]);
  try {
    return JSON.parse(stdout) as ComposedView;
  } catch (err) {
    throw new ComposerError(
      `Composer produced invalid JSON for ${id}: ${(err as Error).message}`,
      stdout,
      0,
    );
  }
}

/** compose <id> --tokenizer <t> — writes .composed/<id>.{json,md}. */
export async function composeWrite(
  repoRoot: string,
  id: string,
  tokenizer: Tokenizer,
): Promise<void> {
  await runComposer(repoRoot, ["compose", id, "--tokenizer", tokenizer]);
}

/** compose --all --tokenizer <t> — rebuild every node's .composed/ output. */
export async function composeAll(repoRoot: string, tokenizer: Tokenizer): Promise<number> {
  const { stdout } = await runComposer(repoRoot, ["compose", "--all", "--tokenizer", tokenizer]);
  const m = /Composed (\d+) node/.exec(stdout);
  return m ? Number(m[1]) : 0;
}

/** budget --tokenizer <t> --json — the per-branch worst-case-leaf report. */
export async function budget(
  repoRoot: string,
  tokenizer: Tokenizer,
  tokenBudget: number,
): Promise<BudgetReport> {
  const { stdout } = await runComposer(repoRoot, [
    "budget",
    "--tokenizer",
    tokenizer,
    "--budget",
    String(tokenBudget),
    "--json",
  ]);
  try {
    return JSON.parse(stdout) as BudgetReport;
  } catch (err) {
    throw new ComposerError(
      `Composer produced invalid JSON for budget: ${(err as Error).message}`,
      stdout,
      0,
    );
  }
}

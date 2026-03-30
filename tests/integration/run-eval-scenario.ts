#!/usr/bin/env npx tsx
/**
 * Standalone runner for a single evaluator scenario.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... npx tsx tests/integration/run-eval-scenario.ts [scenarioName]
 *
 * Scenarios: backend-missing-tests | backend-solid-implementation | backend-critical-bugs
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildSystemPrompt } from "../../src/defaults/prompts.js";
import { detectProjectType } from "../../src/defaults/project-type.js";
import { getDimensions } from "../../src/defaults/criteria.js";
import { FileProtocol } from "../../src/core/file-protocol.js";
import type { ProjectContext, Workspace } from "../../src/core/types.js";
import { ALL_SCENARIOS, type Scenario } from "./eval-fixtures/scenarios.js";

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("Set ANTHROPIC_API_KEY");
  process.exit(1);
}

const scenarioName = process.argv[2] || "backend-missing-tests";
const scenario = ALL_SCENARIOS.find(s => s.name === scenarioName);
if (!scenario) {
  console.error(`Unknown scenario: ${scenarioName}`);
  console.error(`Available: ${ALL_SCENARIOS.map(s => s.name).join(", ")}`);
  process.exit(1);
}

function scaffoldProject(scenario: Scenario): string {
  const root = mkdtempSync(join(tmpdir(), `eval-test-${scenario.name}-`));
  for (const [relPath, content] of Object.entries(scenario.files)) {
    const fullPath = join(root, relPath);
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
  }
  const harnessDir = join(root, ".harness");
  mkdirSync(harnessDir, { recursive: true });
  writeFileSync(join(harnessDir, "contract.md"), scenario.contract, "utf-8");
  return root;
}

function buildContext(scenario: Scenario, root: string): ProjectContext {
  const frameworkMap: Record<string, string | null> = {
    backend: "express",
    frontend: "vite",
    universal: null,
  };
  const ws: Workspace = {
    path: ".",
    stack: {
      language: "typescript",
      framework: frameworkMap[scenario.projectType] ?? null,
      testRunner: "vitest",
      testCommand: "npx vitest run",
      lintCommand: null,
      buildCommand: "npx tsc --noEmit",
      devServer: null,
    },
    claudeMd: null,
  };
  return {
    repoType: "single",
    workspaces: [ws],
    rootClaudeMd: null,
    config: null,
    criteria: null,
    scope: null,
    root,
  };
}

async function main() {
  console.log(`\n━━━ Scenario: ${scenario!.name} ━━━`);
  console.log(`Description: ${scenario!.description}`);
  console.log(`Expected: ${scenario!.expectPass ? "PASS" : "FAIL"}\n`);

  const root = scaffoldProject(scenario!);
  console.log(`Project root: ${root}`);

  const ctx = buildContext(scenario!, root);
  const projectType = detectProjectType(ctx);
  console.log(`Detected type: ${projectType}`);

  const dims = getDimensions(projectType);
  console.log(`Dimensions: ${dims.map(d => d.name).join(", ")}\n`);

  // Show the system prompt (truncated)
  const systemPrompt = buildSystemPrompt("evaluator", ctx);
  console.log(`System prompt length: ${systemPrompt.length} chars`);
  console.log(`\n--- System Prompt (first 500 chars) ---`);
  console.log(systemPrompt.slice(0, 500));
  console.log(`--- end ---\n`);

  // Run evaluator
  console.log("Running evaluator agent...\n");
  const startMs = Date.now();

  const { query } = await import("@anthropic-ai/claude-agent-sdk");

  const conversation = query({
    prompt: `Evaluate the implementation against the sprint contract. Read .harness/contract.md for requirements. Write your evaluation to .harness/evaluation.md.

IMPORTANT: This is a code review — you should READ and ANALYZE the source files, do NOT attempt to install dependencies or start servers. You may attempt to run the test command if a test runner is configured, but if it fails due to missing node_modules, just note that and move on. Focus on reading the code.`,
    options: {
      systemPrompt,
      model: "claude-sonnet-4-5-20250929",
      tools: ["Read", "Bash", "Grep", "Glob", "Write"],
      maxTurns: 25,
      cwd: root,
      allowedTools: ["Read", "Bash", "Grep", "Glob", "Write"],
      permissionMode: "bypassPermissions" as const,
      allowDangerouslySkipPermissions: true,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: API_KEY!,
      },
    },
  });

  let costUsd = 0;
  for await (const message of conversation) {
    if (message.type === "assistant") {
      const msg = message as any;
      if (Array.isArray(msg.message?.content)) {
        for (const block of msg.message.content) {
          if (block.type === "tool_use") {
            console.log(`  🔧 ${block.name}: ${JSON.stringify(block.input).slice(0, 120)}`);
          } else if (block.type === "text" && block.text) {
            console.log(`  💬 ${block.text.slice(0, 200)}`);
          }
        }
      }
    }
    if (message.type === "result") {
      const r = message as any;
      costUsd = r.total_cost_usd ?? 0;
      console.log(`\n  ✅ Agent finished (${r.subtype}) — cost: $${costUsd.toFixed(4)}`);
    }
  }

  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log(`  ⏱  Elapsed: ${elapsedSec}s\n`);

  // Read and display evaluation.md
  const evalPath = join(root, ".harness", "evaluation.md");
  if (!existsSync(evalPath)) {
    console.error("❌ evaluation.md was NOT written!");
    process.exit(1);
  }

  const evalContent = readFileSync(evalPath, "utf-8");
  console.log(`━━━ evaluation.md ━━━`);
  console.log(evalContent);
  console.log(`━━━ end ━━━\n`);

  // Parse with scored parser
  const fp = new FileProtocol(root);
  const result = fp.parseEvaluation(dims);

  console.log(`━━━ Parsed Result ━━━`);
  console.log(`  passed: ${result.passed} (expected: ${scenario!.expectPass})`);
  console.log(`  overallScore: ${result.overallScore}`);

  if (result.dimensions && result.dimensions.length > 0) {
    console.log(`\n  Dimensions:`);
    for (const d of result.dimensions) {
      const status = d.passed ? "✓" : "✗";
      const expected = scenario!.expectations.find(
        e => e.dimensionId === d.id || d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "") === e.dimensionId,
      );
      const rangeStr = expected ? ` [expected: ${expected.minScore}-${expected.maxScore}]` : "";
      const inRange = expected
        ? d.score >= expected.minScore && d.score <= expected.maxScore
          ? "✓"
          : "⚠"
        : "?";
      console.log(`    ${status} ${d.name}: ${d.score}/10 (min: ${d.threshold}) ${inRange}${rangeStr}`);
      if (d.rationale) console.log(`      "${d.rationale}"`);
    }
  } else {
    console.log(`  ⚠  No dimensions parsed! The agent may not have used the scored format.`);
    console.log(`  failedCriteria: ${JSON.stringify(result.failedCriteria)}`);
    console.log(`  passedCriteria: ${JSON.stringify(result.passedCriteria)}`);
  }

  console.log(`\n  Critique: ${result.critique.slice(0, 300)}`);

  // Final verdict
  const passMatch = result.passed === scenario!.expectPass;
  console.log(`\n━━━ Verdict ━━━`);
  console.log(`  Pass/fail correct: ${passMatch ? "✓ YES" : "✗ NO"}`);
  console.log(`  Cost: $${costUsd.toFixed(4)}, Time: ${elapsedSec}s`);

  if (!passMatch) {
    console.log(`  ❌ MISMATCH: expected ${scenario!.expectPass ? "PASS" : "FAIL"}, got ${result.passed ? "PASS" : "FAIL"}`);
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});

/**
 * Integration test: Scored Evaluator
 *
 * Runs the real evaluator agent against fixture projects with known flaws.
 * Requires ANTHROPIC_API_KEY in environment — skips otherwise.
 *
 * Run with:
 *   ANTHROPIC_API_KEY=sk-... npx vitest run tests/integration/scored-evaluator.test.ts
 */
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildSystemPrompt, formatProjectContext } from "../../src/defaults/prompts.js";
import { detectProjectType } from "../../src/defaults/project-type.js";
import { getDimensions } from "../../src/defaults/criteria.js";
import { FileProtocol } from "../../src/core/file-protocol.js";
import type { ProjectContext, Workspace, EvalDimension } from "../../src/core/types.js";
import { ALL_SCENARIOS, type Scenario } from "./eval-fixtures/scenarios.js";

const API_KEY = process.env.ANTHROPIC_API_KEY;
const SHOULD_RUN = Boolean(API_KEY);

// Timeout per scenario — evaluator may take a while
const EVAL_TIMEOUT = 120_000; // 2 minutes

function scaffoldProject(scenario: Scenario): string {
  const root = mkdtempSync(join(tmpdir(), `eval-test-${scenario.name}-`));

  // Write project files
  for (const [relPath, content] of Object.entries(scenario.files)) {
    const fullPath = join(root, relPath);
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
  }

  // Write .harness/contract.md
  const harnessDir = join(root, ".harness");
  mkdirSync(harnessDir, { recursive: true });
  writeFileSync(join(harnessDir, "contract.md"), scenario.contract, "utf-8");

  return root;
}

function buildWorkspaceForScenario(scenario: Scenario, root: string): Workspace {
  const frameworkMap: Record<string, string> = {
    backend: "express",
    frontend: "vite",
    universal: "",
  };
  return {
    path: ".",
    stack: {
      language: "typescript",
      framework: frameworkMap[scenario.projectType] || null,
      testRunner: "vitest",
      testCommand: "npx vitest run",
      lintCommand: null,
      buildCommand: "npx tsc --noEmit",
      devServer: null,
    },
    claudeMd: null,
  };
}

function buildContextForScenario(scenario: Scenario, root: string): ProjectContext {
  return {
    repoType: "single",
    workspaces: [buildWorkspaceForScenario(scenario, root)],
    rootClaudeMd: null,
    config: null,
    criteria: null,
    scope: null,
    root,
  };
}

async function runEvaluatorAgent(
  ctx: ProjectContext,
  root: string,
): Promise<void> {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");

  const systemPrompt = buildSystemPrompt("evaluator", ctx);
  const userPrompt = `Evaluate the implementation against the sprint contract. Read .harness/contract.md for requirements. Write your evaluation to .harness/evaluation.md.`;

  const conversation = query({
    prompt: userPrompt,
    options: {
      systemPrompt,
      model: "claude-sonnet-4-5-20250929",
      tools: ["Read", "Bash", "Grep", "Glob"],
      maxTurns: 30,
      cwd: root,
      allowedTools: ["Read", "Bash", "Grep", "Glob"],
      permissionMode: "bypassPermissions" as const,
      allowDangerouslySkipPermissions: true,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: API_KEY!,
      },
    },
  });

  // Drain the conversation
  for await (const message of conversation) {
    // Just consume — agent writes evaluation.md as a side effect
    if (message.type === "result") {
      const resultMsg = message as { type: "result"; subtype: string; total_cost_usd?: number };
      console.log(`  [evaluator] finished — cost: $${resultMsg.total_cost_usd?.toFixed(4) ?? "?"}`);
    }
  }
}

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe.skipIf(!SHOULD_RUN)("Scored Evaluator Integration", () => {
  for (const scenario of ALL_SCENARIOS) {
    it(
      `${scenario.name}: ${scenario.description}`,
      async () => {
        console.log(`\n=== Scenario: ${scenario.name} ===`);
        console.log(`  Expected: ${scenario.expectPass ? "PASS" : "FAIL"}`);

        // 1. Scaffold the project
        const root = scaffoldProject(scenario);
        tempDirs.push(root);
        console.log(`  Project root: ${root}`);

        // 2. Build context
        const ctx = buildContextForScenario(scenario, root);
        const projectType = detectProjectType(ctx);
        console.log(`  Detected project type: ${projectType}`);

        // 3. Run the evaluator agent
        console.log(`  Running evaluator agent...`);
        await runEvaluatorAgent(ctx, root);

        // 4. Verify evaluation.md was written
        const evalPath = join(root, ".harness", "evaluation.md");
        expect(existsSync(evalPath)).toBe(true);

        const evalContent = readFileSync(evalPath, "utf-8");
        console.log(`\n--- evaluation.md ---\n${evalContent}\n--- end ---\n`);

        // 5. Parse with our scored parser
        const fp = new FileProtocol(root);
        const dims = getDimensions(projectType);
        const result = fp.parseEvaluation(dims);

        console.log(`  Parsed result:`);
        console.log(`    passed: ${result.passed}`);
        console.log(`    overallScore: ${result.overallScore}`);
        if (result.dimensions) {
          for (const d of result.dimensions) {
            const status = d.passed ? "PASS" : "FAIL";
            console.log(`    ${d.name}: ${d.score}/10 (min: ${d.threshold}) [${status}]`);
          }
        }
        console.log(`    failedCriteria: ${JSON.stringify(result.failedCriteria)}`);
        console.log(`    passedCriteria: ${JSON.stringify(result.passedCriteria)}`);

        // 6. Assert pass/fail matches expectation
        expect(result.passed).toBe(scenario.expectPass);

        // 7. Assert scored dimensions were parsed
        expect(result.dimensions).toBeDefined();
        expect(result.dimensions!.length).toBeGreaterThan(0);
        expect(result.overallScore).toBeGreaterThan(0);

        // 8. Assert individual dimension scores are in expected ranges
        if (result.dimensions) {
          for (const expectation of scenario.expectations) {
            const dim = result.dimensions.find(
              d => d.id === expectation.dimensionId ||
                   d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "") === expectation.dimensionId,
            );
            if (dim) {
              console.log(
                `    CHECK ${dim.name}: score=${dim.score}, expected=${expectation.minScore}-${expectation.maxScore}`,
              );
              // Soft assertions — warn if out of range but don't fail
              // (LLM scoring has variance; the key assertion is pass/fail)
              if (dim.score < expectation.minScore || dim.score > expectation.maxScore) {
                console.warn(
                  `    ⚠️  ${dim.name} score ${dim.score} outside expected range [${expectation.minScore}, ${expectation.maxScore}]`,
                );
              }
            }
          }
        }

        // 9. Backward compat: passedCriteria and failedCriteria are populated
        if (result.passed) {
          expect(result.passedCriteria.length).toBeGreaterThan(0);
        } else {
          expect(result.failedCriteria.length).toBeGreaterThan(0);
        }
      },
      EVAL_TIMEOUT,
    );
  }
});

// This always-runs test validates that the prompt/parser pipeline works
// without needing an API key
describe("Scored Evaluator Pipeline (unit)", () => {
  it("generates evaluator prompt with correct dimensions for each scenario", () => {
    for (const scenario of ALL_SCENARIOS) {
      const root = "/tmp/fake-project";
      const ctx = buildContextForScenario(scenario, root);
      const projectType = detectProjectType(ctx);
      const prompt = buildSystemPrompt("evaluator", ctx);

      // All evaluator prompts should have scored structure
      expect(prompt).toContain("## SCORING DIMENSIONS");
      expect(prompt).toContain("fair and calibrated");
      expect(prompt).toContain("Score:");
      expect(prompt).toContain("Rationale:");

      // Backend scenarios should have backend dimensions
      if (scenario.projectType === "backend") {
        expect(prompt).toContain("API Design");
        expect(prompt).toContain("Data Integrity");
      }
    }
  });

  it("parser handles well-formed scored evaluation", () => {
    const root = mkdtempSync(join(tmpdir(), "eval-unit-"));
    tempDirs.push(root);
    const fp = new FileProtocol(root);
    fp.ensureDir();

    fp.writeFile("evaluation.md", `Overall: FAIL
Score: 4.8/10

## Dimensions

### Correctness
Score: 6/10
Rationale: Routes work but POST has no body parser.

### Testing
Score: 2/10
Rationale: No real tests.

### Code Quality
Score: 4/10
Rationale: TODO comments, console.log, any types.

### Error Handling
Score: 3/10
Rationale: Errors swallowed in try/catch.

### API Design
Score: 5/10
Rationale: Endpoints exist but wrong status codes.

## Critique
Missing body parser is a critical bug. No tests. Multiple TODOs left.
`);

    const dims: EvalDimension[] = [
      { id: "correctness", name: "Correctness", description: "", weight: 2.0, threshold: 6, rubric: "" },
      { id: "testing", name: "Testing", description: "", weight: 1.5, threshold: 5, rubric: "" },
      { id: "code-quality", name: "Code Quality", description: "", weight: 1.0, threshold: 5, rubric: "" },
      { id: "error-handling", name: "Error Handling", description: "", weight: 1.0, threshold: 5, rubric: "" },
      { id: "api-design", name: "API Design", description: "", weight: 1.5, threshold: 6, rubric: "" },
    ];

    const result = fp.parseEvaluation(dims);

    expect(result.passed).toBe(false); // Testing 2 < 5, Code Quality 4 < 5, Error Handling 3 < 5, API Design 5 < 6
    expect(result.overallScore).toBe(4.8);
    expect(result.dimensions).toHaveLength(5);

    const testing = result.dimensions!.find(d => d.name === "Testing")!;
    expect(testing.score).toBe(2);
    expect(testing.passed).toBe(false);

    const correctness = result.dimensions!.find(d => d.name === "Correctness")!;
    expect(correctness.score).toBe(6);
    expect(correctness.passed).toBe(true); // 6 >= 6

    expect(result.failedCriteria).toContain("Testing: 2/10 (min: 5)");
    expect(result.passedCriteria).toContain("Correctness: 6/10");
    expect(result.critique).toContain("Missing body parser");
  });
});

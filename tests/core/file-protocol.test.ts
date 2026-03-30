import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { FileProtocol } from "../../src/core/file-protocol.js";
import type { Progress, EvalDimension } from "../../src/core/types.js";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "harness-fp-test-"));
}

let tempDirs: string[] = [];

function createTemp(): string {
  const dir = makeTempDir();
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

function sampleProgress(): Progress {
  return {
    status: "running",
    runSpec: "Build notifications",
    currentSprint: 1,
    totalSprints: 3,
    currentAttempt: 1,
    currentPhase: "generate",
    startedAt: "2025-01-15T10:00:00.000Z",
    costUsd: 1.5,
    maxBudgetUsd: 100,
    sprints: {
      1: { status: "in_progress", attempts: 1, costUsd: 0.5 },
      2: { status: "pending", attempts: 0, costUsd: 0 },
      3: { status: "pending", attempts: 0, costUsd: 0 },
    },
  };
}

describe("FileProtocol", () => {
  it("creates .harness directory on ensureDir", () => {
    const root = createTemp();
    const fp = new FileProtocol(root);

    expect(existsSync(join(root, ".harness"))).toBe(false);

    fp.ensureDir();

    expect(existsSync(join(root, ".harness"))).toBe(true);
  });

  it("writes and reads progress via YAML round-trip", () => {
    const root = createTemp();
    const fp = new FileProtocol(root);
    fp.ensureDir();

    const progress = sampleProgress();
    fp.writeProgress(progress);

    const read = fp.readProgress();

    expect(read).not.toBeNull();
    expect(read!.status).toBe("running");
    expect(read!.runSpec).toBe("Build notifications");
    expect(read!.currentSprint).toBe(1);
    expect(read!.totalSprints).toBe(3);
    expect(read!.currentAttempt).toBe(1);
    expect(read!.currentPhase).toBe("generate");
    expect(read!.startedAt).toBe("2025-01-15T10:00:00.000Z");
    expect(read!.costUsd).toBe(1.5);
    expect(read!.maxBudgetUsd).toBe(100);
    expect(read!.sprints[1].status).toBe("in_progress");
    expect(read!.sprints[1].attempts).toBe(1);
    expect(read!.sprints[2].status).toBe("pending");
  });

  it("reads harness files by name", () => {
    const root = createTemp();
    const fp = new FileProtocol(root);
    fp.ensureDir();

    fp.writeFile("spec.md", "# Spec\nBuild a widget.");

    const content = fp.readFile("spec.md");
    expect(content).toBe("# Spec\nBuild a widget.");
  });

  it("returns null for missing files", () => {
    const root = createTemp();
    const fp = new FileProtocol(root);
    fp.ensureDir();

    const content = fp.readFile("nonexistent.md");
    expect(content).toBeNull();
  });

  it("parses FAIL evaluation with criteria lists", () => {
    const root = createTemp();
    const fp = new FileProtocol(root);
    fp.ensureDir();

    const evalContent = `Status: FAIL

Passed criteria:
- Database persistence works correctly
- Read/unread toggle functions

Failed criteria:
- WebSocket reconnection not implemented
- Error handling is incomplete

Critique:
The implementation is missing WebSocket reconnection logic.
When the connection drops, the client does not attempt to reconnect.`;

    fp.writeFile("evaluation.md", evalContent);

    const result = fp.parseEvaluation();

    expect(result.passed).toBe(false);
    expect(result.passedCriteria).toEqual([
      "Database persistence works correctly",
      "Read/unread toggle functions",
    ]);
    expect(result.failedCriteria).toEqual([
      "WebSocket reconnection not implemented",
      "Error handling is incomplete",
    ]);
    expect(result.critique).toBe(
      "The implementation is missing WebSocket reconnection logic.\nWhen the connection drops, the client does not attempt to reconnect."
    );
  });

  it("parses PASS evaluation", () => {
    const root = createTemp();
    const fp = new FileProtocol(root);
    fp.ensureDir();

    const evalContent = `Status: PASS

Passed criteria:
- All API endpoints return correct responses
- Authentication flow works end-to-end
- Database migrations are clean

Failed criteria:

Critique:
All acceptance criteria have been met. The implementation is solid.`;

    fp.writeFile("evaluation.md", evalContent);

    const result = fp.parseEvaluation();

    expect(result.passed).toBe(true);
    expect(result.passedCriteria).toEqual([
      "All API endpoints return correct responses",
      "Authentication flow works end-to-end",
      "Database migrations are clean",
    ]);
    expect(result.failedCriteria).toEqual([]);
    expect(result.critique).toBe(
      "All acceptance criteria have been met. The implementation is solid."
    );
  });

  it("returns default EvalResult when evaluation.md is missing", () => {
    const root = createTemp();
    const fp = new FileProtocol(root);
    fp.ensureDir();

    const result = fp.parseEvaluation();

    expect(result.passed).toBe(false);
    expect(result.critique).toBe("No evaluation file found");
    expect(result.failedCriteria).toEqual([]);
    expect(result.passedCriteria).toEqual([]);
  });

  it("updates .gitignore with harness entries", () => {
    const root = createTemp();
    const fp = new FileProtocol(root);

    fp.ensureGitignore();

    const gitignore = readFileSync(join(root, ".gitignore"), "utf-8");
    expect(gitignore).toContain("# agents-harness (ephemeral files)");
    expect(gitignore).toContain(".harness/spec.md");
    expect(gitignore).toContain(".harness/sprints.md");
    expect(gitignore).toContain(".harness/contract.md");
    expect(gitignore).toContain(".harness/evaluation.md");
    expect(gitignore).toContain(".harness/handoff.md");
    expect(gitignore).toContain(".harness/progress.md");
    expect(gitignore).toContain(".harness/summary.md");
  });

  it("does not duplicate gitignore entries on repeated calls", () => {
    const root = createTemp();
    const fp = new FileProtocol(root);

    // Pre-existing gitignore with some content
    writeFileSync(join(root, ".gitignore"), "node_modules/\n");

    fp.ensureGitignore();
    fp.ensureGitignore();

    const gitignore = readFileSync(join(root, ".gitignore"), "utf-8");

    // Count occurrences of the header comment
    const matches = gitignore.match(/# agents-harness/g);
    expect(matches).toHaveLength(1);

    // Ensure existing content is preserved
    expect(gitignore).toContain("node_modules/");
  });

  it("cleans ephemeral files but keeps spec.md, summary.md, progress.md", () => {
    const root = createTemp();
    const fp = new FileProtocol(root);
    fp.ensureDir();

    // Create all files
    fp.writeFile("spec.md", "spec content");
    fp.writeFile("sprints.md", "sprints content");
    fp.writeFile("contract.md", "contract content");
    fp.writeFile("evaluation.md", "evaluation content");
    fp.writeFile("handoff.md", "handoff content");
    fp.writeFile("progress.md", "progress content");
    fp.writeFile("summary.md", "summary content");

    fp.cleanEphemeral();

    // Ephemeral files should be deleted
    expect(existsSync(join(root, ".harness", "contract.md"))).toBe(false);
    expect(existsSync(join(root, ".harness", "evaluation.md"))).toBe(false);
    expect(existsSync(join(root, ".harness", "handoff.md"))).toBe(false);
    expect(existsSync(join(root, ".harness", "sprints.md"))).toBe(false);

    // Persistent files should remain
    expect(existsSync(join(root, ".harness", "spec.md"))).toBe(true);
    expect(existsSync(join(root, ".harness", "progress.md"))).toBe(true);
    expect(existsSync(join(root, ".harness", "summary.md"))).toBe(true);
  });

  it("parses scored PASS evaluation format", () => {
    const root = createTemp();
    const fp = new FileProtocol(root);
    fp.ensureDir();

    const evalContent = `Overall: PASS
Score: 7.5/10

## Dimensions

### Correctness
Score: 8/10
Rationale: All features implemented, one minor edge case missed.

### Testing
Score: 7/10
Rationale: Good coverage with happy path and key edge cases.

### Code Quality
Score: 8/10
Rationale: Clean code, follows conventions.

## Critique
Minor improvements possible in error handling.`;

    fp.writeFile("evaluation.md", evalContent);

    const dims: EvalDimension[] = [
      { id: "correctness", name: "Correctness", description: "", weight: 2.0, threshold: 6, rubric: "" },
      { id: "testing", name: "Testing", description: "", weight: 1.5, threshold: 5, rubric: "" },
      { id: "code-quality", name: "Code Quality", description: "", weight: 1.0, threshold: 5, rubric: "" },
    ];

    const result = fp.parseEvaluation(dims);

    expect(result.passed).toBe(true);
    expect(result.overallScore).toBe(7.5);
    expect(result.dimensions).toHaveLength(3);
    expect(result.dimensions![0].name).toBe("Correctness");
    expect(result.dimensions![0].score).toBe(8);
    expect(result.dimensions![0].threshold).toBe(6);
    expect(result.dimensions![0].passed).toBe(true);
    expect(result.dimensions![1].name).toBe("Testing");
    expect(result.dimensions![1].score).toBe(7);
    expect(result.dimensions![1].passed).toBe(true);
    expect(result.critique).toBe("Minor improvements possible in error handling.");
    expect(result.passedCriteria).toEqual([
      "Correctness: 8/10",
      "Testing: 7/10",
      "Code Quality: 8/10",
    ]);
    expect(result.failedCriteria).toEqual([]);
  });

  it("parses scored FAIL evaluation (dimension below threshold)", () => {
    const root = createTemp();
    const fp = new FileProtocol(root);
    fp.ensureDir();

    const evalContent = `Overall: FAIL
Score: 5.2/10

## Dimensions

### Correctness
Score: 7/10
Rationale: Most features work.

### Testing
Score: 3/10
Rationale: Only one test, no edge cases.

### Integration
Score: 6/10
Rationale: Existing tests pass.

## Critique
Testing is severely lacking.`;

    fp.writeFile("evaluation.md", evalContent);

    const dims: EvalDimension[] = [
      { id: "correctness", name: "Correctness", description: "", weight: 2.0, threshold: 6, rubric: "" },
      { id: "testing", name: "Testing", description: "", weight: 1.5, threshold: 5, rubric: "" },
      { id: "integration", name: "Integration", description: "", weight: 1.5, threshold: 6, rubric: "" },
    ];

    const result = fp.parseEvaluation(dims);

    expect(result.passed).toBe(false);
    expect(result.overallScore).toBe(5.2);
    expect(result.dimensions![1].name).toBe("Testing");
    expect(result.dimensions![1].score).toBe(3);
    expect(result.dimensions![1].passed).toBe(false);
    expect(result.failedCriteria).toEqual(["Testing: 3/10 (min: 5)"]);
    expect(result.passedCriteria).toEqual(["Correctness: 7/10", "Integration: 6/10"]);
  });

  it("recomputes passed from scores even if agent says PASS", () => {
    const root = createTemp();
    const fp = new FileProtocol(root);
    fp.ensureDir();

    // Agent says PASS but one dimension is below threshold
    const evalContent = `Overall: PASS
Score: 6.0/10

## Dimensions

### Correctness
Score: 8/10
Rationale: Features work.

### Testing
Score: 4/10
Rationale: Barely any tests.

## Critique
Needs more tests.`;

    fp.writeFile("evaluation.md", evalContent);

    const dims: EvalDimension[] = [
      { id: "correctness", name: "Correctness", description: "", weight: 2.0, threshold: 6, rubric: "" },
      { id: "testing", name: "Testing", description: "", weight: 1.5, threshold: 5, rubric: "" },
    ];

    const result = fp.parseEvaluation(dims);

    // Should be FAIL because Testing (4) < threshold (5)
    expect(result.passed).toBe(false);
  });

  it("uses default threshold of 5 for unknown dimensions", () => {
    const root = createTemp();
    const fp = new FileProtocol(root);
    fp.ensureDir();

    const evalContent = `Overall: PASS
Score: 6.0/10

## Dimensions

### Correctness
Score: 6/10
Rationale: Works.

### Custom Dim
Score: 4/10
Rationale: Below default threshold.

## Critique
Some issues.`;

    fp.writeFile("evaluation.md", evalContent);

    // Only provide known dimensions for Correctness, not Custom Dim
    const dims: EvalDimension[] = [
      { id: "correctness", name: "Correctness", description: "", weight: 2.0, threshold: 6, rubric: "" },
    ];

    const result = fp.parseEvaluation(dims);

    // Custom Dim has score 4 < default threshold 5
    expect(result.passed).toBe(false);
    expect(result.dimensions![1].threshold).toBe(5);
    expect(result.dimensions![1].passed).toBe(false);
  });

  it("legacy format still works unchanged", () => {
    const root = createTemp();
    const fp = new FileProtocol(root);
    fp.ensureDir();

    const evalContent = `Status: FAIL

Passed criteria:
- Database persistence works correctly
- Read/unread toggle functions

Failed criteria:
- WebSocket reconnection not implemented
- Error handling is incomplete

Critique:
The implementation is missing WebSocket reconnection logic.
When the connection drops, the client does not attempt to reconnect.`;

    fp.writeFile("evaluation.md", evalContent);

    const result = fp.parseEvaluation();

    expect(result.passed).toBe(false);
    expect(result.passedCriteria).toEqual([
      "Database persistence works correctly",
      "Read/unread toggle functions",
    ]);
    expect(result.failedCriteria).toEqual([
      "WebSocket reconnection not implemented",
      "Error handling is incomplete",
    ]);
    expect(result.critique).toBe(
      "The implementation is missing WebSocket reconnection logic.\nWhen the connection drops, the client does not attempt to reconnect."
    );
    // No scored fields on legacy
    expect(result.overallScore).toBeUndefined();
    expect(result.dimensions).toBeUndefined();
  });
});

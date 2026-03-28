import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { FileProtocol } from "../../src/core/file-protocol.js";
import type { Progress } from "../../src/core/types.js";

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
    expect(gitignore).toContain("# agent-harness (ephemeral files)");
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
    const matches = gitignore.match(/# agent-harness/g);
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
});

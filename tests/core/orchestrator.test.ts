import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EvalResult } from "../../src/core/types.js";

// Mock all dependencies at module level
vi.mock("../../src/core/context-manager.js");
vi.mock("../../src/core/file-protocol.js");
vi.mock("../../src/discovery/project-context.js");

import { Harness } from "../../src/core/orchestrator.js";
import { ContextManager } from "../../src/core/context-manager.js";
import { FileProtocol } from "../../src/core/file-protocol.js";
import { buildProjectContext } from "../../src/discovery/project-context.js";

const defaultEvalResult: EvalResult = {
  passed: true,
  critique: "",
  failedCriteria: [],
  passedCriteria: ["all"],
};

const failEvalResult: EvalResult = {
  passed: false,
  critique: "Needs improvement",
  failedCriteria: ["criteria-1"],
  passedCriteria: [],
};

function setupMocks() {
  // buildProjectContext returns a minimal ProjectContext
  vi.mocked(buildProjectContext).mockReturnValue({
    repoType: "single",
    workspaces: [],
    rootClaudeMd: null,
    config: null,
    criteria: null,
    scope: null,
    root: "/tmp/test",
  });

  // ContextManager.prototype.runAgent returns a default result
  vi.mocked(ContextManager.prototype.runAgent).mockResolvedValue({
    response: "",
    costUsd: 0.01,
  });

  // FileProtocol methods are no-ops or return defaults
  vi.mocked(FileProtocol.prototype.ensureDir).mockReturnValue(undefined);
  vi.mocked(FileProtocol.prototype.ensureGitignore).mockReturnValue(undefined);
  vi.mocked(FileProtocol.prototype.writeFile).mockReturnValue(undefined);
  vi.mocked(FileProtocol.prototype.writeProgress).mockReturnValue(undefined);
  vi.mocked(FileProtocol.prototype.readFile).mockImplementation(
    (name: string) => {
      if (name === "sprints.md") {
        return "## Sprint 1\nDo stuff\n";
      }
      return null;
    },
  );
  vi.mocked(FileProtocol.prototype.readProgress).mockReturnValue(null);
  vi.mocked(FileProtocol.prototype.parseEvaluation).mockReturnValue(
    defaultEvalResult,
  );
}

function createHarness(overrides: Partial<Parameters<typeof Harness>[0]> = {}) {
  return new Harness({
    apiKey: "test-key",
    root: "/tmp/test",
    ...overrides,
  });
}

describe("Harness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  describe("constructor", () => {
    it("constructs with required options", () => {
      const harness = createHarness();
      expect(harness).toBeInstanceOf(Harness);
    });
  });

  describe("run()", () => {
    it("emits phase:start for plan phase", async () => {
      const harness = createHarness();
      const phases: string[] = [];

      harness.on("phase:start", (data) => {
        phases.push(data.phase);
      });

      await harness.run("Build a todo app");

      expect(phases[0]).toBe("plan");
    });

    it("emits phase:start for decompose phase", async () => {
      const harness = createHarness();
      const phases: string[] = [];

      harness.on("phase:start", (data) => {
        phases.push(data.phase);
      });

      await harness.run("Build a todo app");

      expect(phases).toContain("decompose");
    });

    it("calls planner for spec, decompose, and contract phases", async () => {
      const harness = createHarness();
      await harness.run("Build a feature");

      const runAgentCalls = vi.mocked(ContextManager.prototype.runAgent).mock
        .calls;
      const plannerCalls = runAgentCalls.filter((c) => c[0].role === "planner");

      // At minimum: plan (spec), decompose, contract
      expect(plannerCalls.length).toBeGreaterThanOrEqual(3);

      // First call is the spec expansion (plan phase)
      expect(plannerCalls[0][0].prompt).toContain("spec.md");

      // Second call is the decompose phase
      expect(plannerCalls[1][0].prompt).toContain("Decompose");

      // Third call is the contract phase
      expect(plannerCalls[2][0].prompt).toContain("sprint contract");
    });

    it("calls generator for implementation", async () => {
      const harness = createHarness();
      await harness.run("Build a feature");

      const runAgentCalls = vi.mocked(ContextManager.prototype.runAgent).mock
        .calls;
      const generatorCalls = runAgentCalls.filter(
        (c) => c[0].role === "generator",
      );

      expect(generatorCalls.length).toBeGreaterThanOrEqual(1);
      expect(generatorCalls[0][0].prompt).toContain("contract.md");
    });

    it("calls evaluator for testing", async () => {
      const harness = createHarness();
      await harness.run("Build a feature");

      const runAgentCalls = vi.mocked(ContextManager.prototype.runAgent).mock
        .calls;
      const evaluatorCalls = runAgentCalls.filter(
        (c) => c[0].role === "evaluator",
      );

      expect(evaluatorCalls.length).toBeGreaterThanOrEqual(1);
      expect(evaluatorCalls[0][0].prompt).toContain("evaluation.md");
    });

    it("emits evaluation event", async () => {
      const harness = createHarness();
      const evaluations: Array<{ sprint: number; attempt: number; result: EvalResult }> = [];

      harness.on("evaluation", (data) => {
        evaluations.push(data);
      });

      await harness.run("Build a feature");

      expect(evaluations.length).toBeGreaterThanOrEqual(1);
      expect(evaluations[0].sprint).toBe(1);
      expect(evaluations[0].attempt).toBe(1);
      expect(evaluations[0].result.passed).toBe(true);
    });

    it("emits sprint:complete event when sprint passes", async () => {
      const harness = createHarness();
      const sprintEvents: Array<{ sprint: number; status: string }> = [];

      harness.on("sprint:complete", (data) => {
        sprintEvents.push(data);
      });

      await harness.run("Build a feature");

      expect(sprintEvents.length).toBe(1);
      expect(sprintEvents[0].sprint).toBe(1);
      expect(sprintEvents[0].status).toBe("passed");
    });

    it("loops on evaluation failure then passes on retry", async () => {
      // First evaluation fails, second passes
      vi.mocked(FileProtocol.prototype.parseEvaluation)
        .mockReturnValueOnce(failEvalResult)
        .mockReturnValueOnce(defaultEvalResult);

      const harness = createHarness();
      await harness.run("Build a feature");

      const runAgentCalls = vi.mocked(ContextManager.prototype.runAgent).mock
        .calls;
      const generatorCalls = runAgentCalls.filter(
        (c) => c[0].role === "generator",
      );

      // Generator should be called twice (once per attempt)
      expect(generatorCalls.length).toBe(2);

      // Second attempt prompt should reference evaluation feedback
      expect(generatorCalls[1][0].prompt).toContain("evaluation.md");
    });

    it("emits run:complete event when done", async () => {
      const harness = createHarness();
      let runComplete: { status: string } | null = null;

      harness.on("run:complete", (data) => {
        runComplete = data;
      });

      await harness.run("Build a feature");

      expect(runComplete).not.toBeNull();
      expect(runComplete!.status).toBe("completed");
    });

    it("respects budget limit and stops early", async () => {
      // Set budget that allows plan + decompose + contract but runs out during the sprint.
      // Each call costs 0.01. Plan (0.01) + decompose (0.01) + contract (0.01) = 0.03.
      // Generator (0.01) = 0.04 which hits the budget of 0.04, so evaluate never runs.
      const harness = createHarness({ maxTotalBudgetUsd: 0.04 });

      vi.mocked(ContextManager.prototype.runAgent).mockResolvedValue({
        response: "",
        costUsd: 0.01,
      });

      let runComplete: { status: string } | null = null;
      harness.on("run:complete", (data) => {
        runComplete = data;
      });

      await harness.run("Build a feature");

      const runAgentCalls = vi.mocked(ContextManager.prototype.runAgent).mock
        .calls;

      // Evaluator should never be called because budget is exceeded after generator
      const evaluatorCalls = runAgentCalls.filter(
        (c) => c[0].role === "evaluator",
      );
      expect(evaluatorCalls.length).toBe(0);

      expect(runComplete).not.toBeNull();
      // Sprint never finished (still in_progress), so status should be "failed"
      expect(runComplete!.status).toBe("failed");
    });
  });

  describe("crash recovery", () => {
    it("saves progress as stopped when runAgent throws", async () => {
      const harness = createHarness();

      // Let plan + decompose succeed, then throw during contract phase
      let callCount = 0;
      vi.mocked(ContextManager.prototype.runAgent).mockImplementation(
        async () => {
          callCount++;
          if (callCount === 3) {
            // contract phase — simulate API credit error
            throw new Error("credit limit exceeded");
          }
          return { response: "", costUsd: 0.01 };
        },
      );

      await expect(harness.run("Build a feature")).rejects.toThrow(
        "credit limit exceeded",
      );

      // Verify progress was saved as "stopped"
      const writeProgressCalls = vi.mocked(
        FileProtocol.prototype.writeProgress,
      ).mock.calls;
      const lastSavedProgress =
        writeProgressCalls[writeProgressCalls.length - 1][0];

      expect(lastSavedProgress.status).toBe("stopped");
      expect(lastSavedProgress.stoppedAt).toBeDefined();
      // Cost from the two successful calls should be preserved
      expect(lastSavedProgress.costUsd).toBe(0.02);
    });

    it("resume preserves existing sprint cost and attempts", async () => {
      // Simulate a saved progress from a crashed run mid-sprint
      vi.mocked(FileProtocol.prototype.readProgress).mockReturnValue({
        status: "stopped",
        runSpec: "Build a feature",
        currentSprint: 1,
        totalSprints: 1,
        currentAttempt: 1,
        currentPhase: "generate",
        startedAt: "2025-01-01T00:00:00.000Z",
        stoppedAt: "2025-01-01T00:01:00.000Z",
        costUsd: 0.05,
        maxBudgetUsd: 50,
        sprints: {
          1: {
            status: "in_progress",
            attempts: 1,
            costUsd: 0.03,
          },
        },
      });

      const harness = createHarness();
      await harness.resume();

      // executeSprint should NOT have reset the sprint's cost/attempts to 0
      const progress = harness.getProgress();
      expect(progress.sprints[1].costUsd).toBeGreaterThan(0.03);
      expect(progress.sprints[1].attempts).toBeGreaterThanOrEqual(1);
    });
  });

  describe("stop()", () => {
    it("sets progress to stopped", () => {
      const harness = createHarness();
      harness.stop();

      const progress = harness.getProgress();
      expect(progress.status).toBe("stopped");
      expect(progress.stoppedAt).toBeDefined();
    });
  });

  describe("getProgress()", () => {
    it("returns a copy of progress", () => {
      const harness = createHarness();
      const p1 = harness.getProgress();
      const p2 = harness.getProgress();

      // Should be equal in value but different references
      expect(p1).toEqual(p2);
      expect(p1).not.toBe(p2);
    });
  });
});

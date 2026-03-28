import { describe, it, expect } from "vitest";
import type { ProjectContext, Progress, EvalResult, HarnessConfig } from "../../src/core/types.js";

describe("Core Types", () => {
  it("should construct a valid ProjectContext", () => {
    const ctx: ProjectContext = {
      repoType: "single",
      workspaces: [{
        path: ".",
        stack: { language: "typescript", framework: "nextjs", testRunner: "vitest", testCommand: "npm test", lintCommand: "npm run lint", buildCommand: "npm run build", devServer: "npm run dev" },
        claudeMd: null,
      }],
      rootClaudeMd: null,
      config: null,
      criteria: null,
      scope: null,
      root: "/tmp/test-project",
    };
    expect(ctx.repoType).toBe("single");
    expect(ctx.workspaces).toHaveLength(1);
  });

  it("should construct a valid Progress", () => {
    const progress: Progress = {
      status: "running",
      runSpec: "Build notifications",
      currentSprint: 1,
      totalSprints: 3,
      currentAttempt: 1,
      currentPhase: "generate",
      startedAt: new Date().toISOString(),
      costUsd: 0,
      maxBudgetUsd: 100,
      sprints: {
        1: { status: "in_progress", attempts: 1, costUsd: 0 },
        2: { status: "pending", attempts: 0, costUsd: 0 },
        3: { status: "pending", attempts: 0, costUsd: 0 },
      },
    };
    expect(progress.status).toBe("running");
  });

  it("should construct a valid EvalResult", () => {
    const result: EvalResult = {
      passed: false,
      critique: "Missing reconnection logic",
      failedCriteria: ["WebSocket reconnection"],
      passedCriteria: ["Database persistence", "Read/unread toggle"],
    };
    expect(result.passed).toBe(false);
    expect(result.failedCriteria).toHaveLength(1);
  });

  it("should construct a valid HarnessConfig", () => {
    const config: HarnessConfig = {
      agents: {
        planner: { model: "sonnet", maxTurns: 15 },
        generator: { model: "opus" },
      },
      maxAttemptsPerSprint: 5,
      maxTotalBudgetUsd: 200,
    };
    expect(config.agents?.planner?.model).toBe("sonnet");
  });
});

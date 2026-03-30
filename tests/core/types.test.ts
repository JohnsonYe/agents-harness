import { describe, it, expect } from "vitest";
import type {
  ProjectContext, Progress, EvalResult, HarnessConfig,
  FileUpdateEvent, StateSnapshotEvent, HarnessEvent,
} from "../../src/core/types.js";

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

  it("should construct a valid FileUpdateEvent", () => {
    const event: FileUpdateEvent = {
      name: "contract.md",
      content: "# Contract\nCriteria here",
    };
    expect(event.name).toBe("contract.md");
    expect(event.content).toContain("Contract");
  });

  it("should construct a valid StateSnapshotEvent", () => {
    const event: StateSnapshotEvent = {
      files: { "spec.md": "# Spec content", "contract.md": null },
      progress: null,
    };
    expect(event.files["spec.md"]).toBe("# Spec content");
    expect(event.files["contract.md"]).toBeNull();
    expect(event.progress).toBeNull();
  });

  it("HarnessEvent union includes file:update and state:snapshot", () => {
    const fileEvent: HarnessEvent = {
      type: "file:update",
      data: { name: "spec.md", content: "content" },
    };
    expect(fileEvent.type).toBe("file:update");

    const snapshotEvent: HarnessEvent = {
      type: "state:snapshot",
      data: { files: {}, progress: null },
    };
    expect(snapshotEvent.type).toBe("state:snapshot");
  });
});

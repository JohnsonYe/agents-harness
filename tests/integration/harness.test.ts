import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock the Agent SDK
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));

import { Harness } from "../../src/core/orchestrator.js";
import { FileProtocol } from "../../src/core/file-protocol.js";
import type { HarnessEvent, RunCompleteEvent, PhaseStartEvent } from "../../src/core/types.js";

describe("Harness integration", () => {
  let tempDir: string;
  let callCount: number;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "harness-integration-"));
    callCount = 0;

    // Create a minimal project
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({
      name: "test-project",
      scripts: { test: "echo test" },
    }));

    // Mock the SDK query function to simulate agent behavior
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    vi.mocked(query).mockImplementation(async (opts: any) => {
      callCount++;
      const prompt: string = opts.prompt || "";

      // Simulate planner writing sprints.md
      if (prompt.includes("Decompose") || prompt.includes("sprint plan")) {
        // Write sprints file to the harness dir
        const fp = new FileProtocol(tempDir);
        fp.ensureDir();
        fp.writeFile("sprints.md", "## Sprint 1\nBuild the feature\n");
      }

      // Simulate evaluator writing evaluation.md with PASS
      if (prompt.includes("Evaluate")) {
        const fp = new FileProtocol(tempDir);
        fp.ensureDir();
        fp.writeFile("evaluation.md", "Status: PASS\nPassed criteria:\n- All criteria met\nFailed criteria:\nCritique:\n");
      }

      return {
        messages: [
          { role: "assistant", content: [{ type: "text", text: "Done" }] },
        ],
        usage: { cost_usd: 0.01 },
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("runs a full lifecycle and emits events", async () => {
    const harness = new Harness({
      apiKey: "test-key",
      root: tempDir,
      maxTotalBudgetUsd: 10,
    });

    const events: HarnessEvent[] = [];
    harness.on("event", (e: HarnessEvent) => events.push(e));

    const phaseEvents: PhaseStartEvent[] = [];
    harness.on("phase:start", (data: PhaseStartEvent) => phaseEvents.push(data));

    let runComplete: RunCompleteEvent | null = null;
    harness.on("run:complete", (data: RunCompleteEvent) => {
      runComplete = data;
    });

    await harness.run("Build a test feature");

    // Verify phase:start events were emitted
    expect(phaseEvents.length).toBeGreaterThan(0);
    const phases = phaseEvents.map(e => e.phase);
    expect(phases).toContain("plan");
    expect(phases).toContain("decompose");

    // Verify run:complete was emitted
    expect(runComplete).not.toBeNull();
    expect(runComplete!.status).toBe("completed");
    expect(runComplete!.totalCostUsd).toBeGreaterThan(0);

    // Verify the event stream has events
    expect(events.length).toBeGreaterThan(0);

    // Verify file protocol files were created
    const fp = new FileProtocol(tempDir);
    const progress = fp.readProgress();
    expect(progress).not.toBeNull();
    expect(progress!.status).toBe("completed");
  });

  it("emits evaluation events", async () => {
    const harness = new Harness({
      apiKey: "test-key",
      root: tempDir,
      maxTotalBudgetUsd: 10,
    });

    const evaluations: any[] = [];
    harness.on("evaluation", (data: any) => evaluations.push(data));

    await harness.run("Build a feature");

    expect(evaluations.length).toBeGreaterThan(0);
    expect(evaluations[0].result.passed).toBe(true);
  });

  it("manages .harness directory", async () => {
    const harness = new Harness({
      apiKey: "test-key",
      root: tempDir,
      maxTotalBudgetUsd: 10,
    });

    await harness.run("Test spec");

    // .harness directory should exist
    expect(existsSync(join(tempDir, ".harness"))).toBe(true);
    // progress.md should exist
    expect(existsSync(join(tempDir, ".harness", "progress.md"))).toBe(true);
  });
});

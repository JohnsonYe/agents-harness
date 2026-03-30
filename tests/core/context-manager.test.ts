import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProjectContext, HarnessConfig } from "../../src/core/types.js";

// Helper to create an async generator from an array of messages
async function* mockAsyncGenerator(messages: unknown[]) {
  for (const msg of messages) {
    yield msg;
  }
}

// Mock the Claude Agent SDK at module level
const mockQuery = vi.fn();
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

// Mock buildSystemPrompt so we can verify it's called without pulling in the real implementation
vi.mock("../../src/defaults/prompts.js", () => ({
  buildSystemPrompt: vi.fn(
    (role: string, _ctx: ProjectContext, append?: string) =>
      `system-prompt-for-${role}${append ? `-${append}` : ""}`,
  ),
}));

import { ContextManager } from "../../src/core/context-manager.js";
import { buildSystemPrompt } from "../../src/defaults/prompts.js";

function makeContext(overrides: Partial<ProjectContext> = {}): ProjectContext {
  return {
    repoType: "single",
    workspaces: [
      {
        path: ".",
        stack: {
          language: "typescript",
          framework: "vite",
          testRunner: "vitest",
          testCommand: "vitest run",
          lintCommand: "eslint .",
          buildCommand: "tsc",
          devServer: null,
        },
        claudeMd: null,
      },
    ],
    rootClaudeMd: null,
    config: null,
    criteria: null,
    scope: null,
    root: "/tmp/test-project",
    ...overrides,
  };
}

describe("ContextManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("constructs with API key and project context", () => {
      const ctx = makeContext();
      const manager = new ContextManager("test-api-key", ctx);
      expect(manager).toBeInstanceOf(ContextManager);
    });
  });

  describe("getModelForRole", () => {
    it("returns correct default for planner", () => {
      const manager = new ContextManager("key", makeContext());
      expect(manager.getModelForRole("planner")).toBe(
        "claude-sonnet-4-5-20250929",
      );
    });

    it("returns correct default for generator", () => {
      const manager = new ContextManager("key", makeContext());
      expect(manager.getModelForRole("generator")).toBe("claude-opus-4-6");
    });

    it("returns correct default for evaluator", () => {
      const manager = new ContextManager("key", makeContext());
      expect(manager.getModelForRole("evaluator")).toBe(
        "claude-sonnet-4-5-20250929",
      );
    });
  });

  describe("getToolsForRole", () => {
    it("returns correct tools for planner", () => {
      const manager = new ContextManager("key", makeContext());
      expect(manager.getToolsForRole("planner")).toEqual(["Read", "Write"]);
    });

    it("returns correct tools for generator", () => {
      const manager = new ContextManager("key", makeContext());
      expect(manager.getToolsForRole("generator")).toEqual([
        "Read",
        "Edit",
        "Write",
        "Bash",
        "Glob",
        "Grep",
      ]);
    });

    it("returns correct tools for evaluator", () => {
      const manager = new ContextManager("key", makeContext());
      expect(manager.getToolsForRole("evaluator")).toEqual([
        "Read",
        "Bash",
        "Grep",
        "Glob",
      ]);
    });
  });

  describe("getMaxTurnsForRole", () => {
    it("returns correct default for planner", () => {
      const manager = new ContextManager("key", makeContext());
      expect(manager.getMaxTurnsForRole("planner")).toBe(30);
    });

    it("returns correct default for generator", () => {
      const manager = new ContextManager("key", makeContext());
      expect(manager.getMaxTurnsForRole("generator")).toBe(100);
    });

    it("returns correct default for evaluator", () => {
      const manager = new ContextManager("key", makeContext());
      expect(manager.getMaxTurnsForRole("evaluator")).toBe(50);
    });
  });

  describe("config overrides", () => {
    it("uses config override for model", () => {
      const config: HarnessConfig = {
        agents: {
          planner: { model: "opus" },
        },
      };
      const manager = new ContextManager("key", makeContext({ config }));
      expect(manager.getModelForRole("planner")).toBe("claude-opus-4-6");
    });

    it("uses config override for maxTurns", () => {
      const config: HarnessConfig = {
        agents: {
          generator: { maxTurns: 50 },
        },
      };
      const manager = new ContextManager("key", makeContext({ config }));
      expect(manager.getMaxTurnsForRole("generator")).toBe(50);
    });

    it("passes through unknown model names directly", () => {
      const config: HarnessConfig = {
        agents: {
          planner: { model: "claude-custom-model-2025" },
        },
      };
      const manager = new ContextManager("key", makeContext({ config }));
      expect(manager.getModelForRole("planner")).toBe(
        "claude-custom-model-2025",
      );
    });
  });

  describe("runAgent", () => {
    it("calls query with correct parameters", async () => {
      const ctx = makeContext();
      const manager = new ContextManager("test-api-key", ctx);

      mockQuery.mockReturnValue(
        mockAsyncGenerator([
          {
            type: "result",
            subtype: "success",
            result: "Generated plan",
            total_cost_usd: 0.05,
          },
        ]),
      );

      await manager.runAgent({ role: "planner", prompt: "Create a plan" });

      expect(mockQuery).toHaveBeenCalledOnce();
      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.prompt).toBe("Create a plan");
      expect(callArgs.options.model).toBe("claude-sonnet-4-5-20250929");
      expect(callArgs.options.systemPrompt).toBe("system-prompt-for-planner");
      expect(callArgs.options.tools).toEqual(["Read", "Write"]);
      expect(callArgs.options.maxTurns).toBe(30);
      expect(callArgs.options.cwd).toBe("/tmp/test-project");
    });

    it("returns response and cost from result message", async () => {
      const manager = new ContextManager("key", makeContext());

      mockQuery.mockReturnValue(
        mockAsyncGenerator([
          {
            type: "result",
            subtype: "success",
            result: "Here is the implementation",
            total_cost_usd: 0.12,
          },
        ]),
      );

      const result = await manager.runAgent({
        role: "generator",
        prompt: "Implement feature",
      });

      expect(result.response).toBe("Here is the implementation");
      expect(result.costUsd).toBe(0.12);
    });

    it("returns empty response when no result message", async () => {
      const manager = new ContextManager("key", makeContext());

      mockQuery.mockReturnValue(mockAsyncGenerator([]));

      const result = await manager.runAgent({
        role: "planner",
        prompt: "Plan something",
      });

      expect(result.response).toBe("");
      expect(result.costUsd).toBe(0);
    });

    it("collects activity events from assistant tool_use blocks", async () => {
      const manager = new ContextManager("key", makeContext());

      mockQuery.mockReturnValue(
        mockAsyncGenerator([
          {
            type: "assistant",
            message: {
              content: [
                {
                  type: "tool_use",
                  name: "Read",
                  input: { file_path: "/src/index.ts" },
                },
                {
                  type: "tool_use",
                  name: "Edit",
                  input: { file_path: "/src/utils.ts" },
                },
                { type: "text", text: "Done editing" },
              ],
            },
          },
          {
            type: "result",
            subtype: "success",
            result: "Done",
            total_cost_usd: 0.08,
          },
        ]),
      );

      const activities: Array<{ tool: string; summary: string }> = [];
      const onActivity = (tool: string, summary: string) => {
        activities.push({ tool, summary });
      };

      await manager.runAgent({
        role: "generator",
        prompt: "Edit some files",
        onActivity,
      });

      expect(activities).toHaveLength(2);
      expect(activities[0]).toEqual({
        tool: "Read",
        summary: "Read /src/index.ts",
      });
      expect(activities[1]).toEqual({
        tool: "Edit",
        summary: "Edit /src/utils.ts",
      });
    });

    it("summarizes Bash tool use with truncated command", async () => {
      const manager = new ContextManager("key", makeContext());
      const longCommand =
        "npm run test -- --coverage --reporter=verbose " + "x".repeat(100);

      mockQuery.mockReturnValue(
        mockAsyncGenerator([
          {
            type: "assistant",
            message: {
              content: [
                { type: "tool_use", name: "Bash", input: { command: longCommand } },
              ],
            },
          },
          {
            type: "result",
            subtype: "success",
            result: "",
            total_cost_usd: 0.03,
          },
        ]),
      );

      const activities: Array<{ tool: string; summary: string }> = [];
      await manager.runAgent({
        role: "generator",
        prompt: "Run tests",
        onActivity: (tool, summary) => activities.push({ tool, summary }),
      });

      expect(activities).toHaveLength(1);
      expect(activities[0].tool).toBe("Bash");
      expect(activities[0].summary).toBe(`Bash: ${longCommand.slice(0, 80)}`);
    });

    it("summarizes Glob and Grep tool use", async () => {
      const manager = new ContextManager("key", makeContext());

      mockQuery.mockReturnValue(
        mockAsyncGenerator([
          {
            type: "assistant",
            message: {
              content: [
                { type: "tool_use", name: "Glob", input: { pattern: "**/*.ts" } },
                { type: "tool_use", name: "Grep", input: { pattern: "TODO" } },
              ],
            },
          },
          {
            type: "result",
            subtype: "success",
            result: "",
            total_cost_usd: 0.02,
          },
        ]),
      );

      const activities: Array<{ tool: string; summary: string }> = [];
      await manager.runAgent({
        role: "evaluator",
        prompt: "Evaluate",
        onActivity: (tool, summary) => activities.push({ tool, summary }),
      });

      expect(activities).toEqual([
        { tool: "Glob", summary: "Glob **/*.ts" },
        { tool: "Grep", summary: "Grep TODO" },
      ]);
    });

    it("summarizes unknown tool use with just the name", async () => {
      const manager = new ContextManager("key", makeContext());

      mockQuery.mockReturnValue(
        mockAsyncGenerator([
          {
            type: "assistant",
            message: {
              content: [
                { type: "tool_use", name: "CustomTool", input: { foo: "bar" } },
              ],
            },
          },
          {
            type: "result",
            subtype: "success",
            result: "",
            total_cost_usd: 0.01,
          },
        ]),
      );

      const activities: Array<{ tool: string; summary: string }> = [];
      await manager.runAgent({
        role: "generator",
        prompt: "Do something",
        onActivity: (tool, summary) => activities.push({ tool, summary }),
      });

      expect(activities).toEqual([
        { tool: "CustomTool", summary: "CustomTool" },
      ]);
    });

    it("passes systemPromptAppend from config to buildSystemPrompt", async () => {
      const config: HarnessConfig = {
        agents: {
          generator: { systemPromptAppend: "Use tabs." },
        },
      };
      const ctx = makeContext({ config });
      const manager = new ContextManager("key", ctx);

      mockQuery.mockReturnValue(
        mockAsyncGenerator([
          {
            type: "result",
            subtype: "success",
            result: "ok",
            total_cost_usd: 0.01,
          },
        ]),
      );

      await manager.runAgent({ role: "generator", prompt: "Implement" });

      expect(buildSystemPrompt).toHaveBeenCalledWith(
        "generator",
        ctx,
        "Use tabs.",
      );
    });

    it("does not throw when onActivity is not provided", async () => {
      const manager = new ContextManager("key", makeContext());

      mockQuery.mockReturnValue(
        mockAsyncGenerator([
          {
            type: "assistant",
            message: {
              content: [
                {
                  type: "tool_use",
                  name: "Read",
                  input: { file_path: "/a.ts" },
                },
                { type: "text", text: "Done" },
              ],
            },
          },
          {
            type: "result",
            subtype: "success",
            result: "Done",
            total_cost_usd: 0.01,
          },
        ]),
      );

      const result = await manager.runAgent({
        role: "generator",
        prompt: "Do work",
      });

      expect(result.response).toBe("Done");
    });

    it("handles error result messages", async () => {
      const manager = new ContextManager("key", makeContext());

      mockQuery.mockReturnValue(
        mockAsyncGenerator([
          {
            type: "result",
            subtype: "error_max_turns",
            total_cost_usd: 0.50,
          },
        ]),
      );

      const result = await manager.runAgent({
        role: "generator",
        prompt: "Work",
      });

      expect(result.response).toBe("");
      expect(result.costUsd).toBe(0.50);
    });
  });
});

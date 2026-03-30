import { describe, it, expect } from "vitest";
import { buildSystemPrompt, formatProjectContext } from "../../src/defaults/prompts.js";
import type { ProjectContext } from "../../src/core/types.js";

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

describe("formatProjectContext", () => {
  it("formats basic project context", () => {
    const ctx = makeContext();
    const result = formatProjectContext(ctx);

    expect(result).toContain("Repository type: single");
    expect(result).toContain("Root: /tmp/test-project");
    expect(result).toContain("Language: typescript");
    expect(result).toContain("Framework: vite");
    expect(result).toContain("Test runner: vitest");
    expect(result).toContain("Test command: vitest run");
    expect(result).toContain("Lint command: eslint .");
  });

  it("includes scope when present", () => {
    const ctx = makeContext({ scope: ["packages/frontend", "packages/api"] });
    const result = formatProjectContext(ctx);

    expect(result).toContain("Scope: packages/frontend, packages/api");
  });

  it("includes CLAUDE.md content when present", () => {
    const ctx = makeContext({
      rootClaudeMd: "# Project Rules\nUse vitest for tests.",
    });
    const result = formatProjectContext(ctx);

    expect(result).toContain("CLAUDE.md:");
    expect(result).toContain("# Project Rules");
    expect(result).toContain("Use vitest for tests.");
  });

  it("formats multiple workspaces", () => {
    const ctx = makeContext({
      repoType: "monorepo",
      workspaces: [
        {
          path: "packages/frontend",
          stack: {
            language: "typescript",
            framework: "react",
            testRunner: "vitest",
            testCommand: "vitest run",
            lintCommand: null,
            buildCommand: "vite build",
            devServer: "vite dev",
          },
          claudeMd: null,
        },
        {
          path: "packages/api",
          stack: {
            language: "python",
            framework: "fastapi",
            testRunner: "pytest",
            testCommand: "pytest",
            lintCommand: "ruff check",
            buildCommand: null,
            devServer: null,
          },
          claudeMd: null,
        },
      ],
    });
    const result = formatProjectContext(ctx);

    expect(result).toContain("Repository type: monorepo");
    expect(result).toContain("packages/frontend");
    expect(result).toContain("packages/api");
    expect(result).toContain("Framework: react");
    expect(result).toContain("Framework: fastapi");
    expect(result).toContain("Dev server: vite dev");
  });
});

describe("buildSystemPrompt", () => {
  it("builds planner prompt with project context", () => {
    const ctx = makeContext();
    const prompt = buildSystemPrompt("planner", ctx);

    expect(prompt).toContain("You are a product planner");
    expect(prompt).toContain("## PROJECT CONTEXT");
    expect(prompt).toContain("typescript");
  });

  it("builds generator prompt with role separation rule", () => {
    const ctx = makeContext();
    const prompt = buildSystemPrompt("generator", ctx);

    expect(prompt).toContain("You are a code generator");
    expect(prompt).toContain("Do NOT evaluate your own work");
    expect(prompt).toContain("## PROJECT CONTEXT");
  });

  it("builds evaluator prompt with calibrated mindset", () => {
    const ctx = makeContext();
    const prompt = buildSystemPrompt("evaluator", ctx);

    expect(prompt).toContain("fair and calibrated");
    expect(prompt).toContain("## PROJECT CONTEXT");
    expect(prompt).toContain("## SCORING DIMENSIONS");
  });

  it("evaluator prompt for Vite context contains UI/UX Quality", () => {
    const ctx = makeContext();
    const prompt = buildSystemPrompt("evaluator", ctx);

    // Vite is a frontend framework, so frontend dimensions should be included
    expect(prompt).toContain("UI/UX Quality");
    expect(prompt).toContain("Component Architecture");
    expect(prompt).toContain("Accessibility");
  });

  it("evaluator prompt for Django context contains API Design", () => {
    const ctx = makeContext({
      workspaces: [
        {
          path: ".",
          stack: {
            language: "python",
            framework: "django",
            testRunner: "pytest",
            testCommand: "pytest",
            lintCommand: null,
            buildCommand: null,
            devServer: null,
          },
          claudeMd: null,
        },
      ],
    });
    const prompt = buildSystemPrompt("evaluator", ctx);

    expect(prompt).toContain("API Design");
    expect(prompt).toContain("Data Integrity");
    expect(prompt).toContain("Concurrency Safety");
  });

  it("includes CLAUDE.md content when present in context", () => {
    const ctx = makeContext({
      rootClaudeMd: "# Custom Rules\nAlways use strict TypeScript.",
    });
    const prompt = buildSystemPrompt("generator", ctx);

    expect(prompt).toContain("CLAUDE.md:");
    expect(prompt).toContain("# Custom Rules");
    expect(prompt).toContain("Always use strict TypeScript.");
  });

  it("includes custom criteria for evaluator", () => {
    const ctx = makeContext({
      criteria: "- All API endpoints return proper status codes\n- Rate limiting is enforced",
    });
    const prompt = buildSystemPrompt("evaluator", ctx);

    expect(prompt).toContain("## CUSTOM CRITERIA");
    expect(prompt).toContain("All API endpoints return proper status codes");
    expect(prompt).toContain("Rate limiting is enforced");
  });

  it("appends user prompt additions", () => {
    const ctx = makeContext();
    const prompt = buildSystemPrompt("generator", ctx, "Always use tabs for indentation.");

    expect(prompt).toContain("## ADDITIONAL INSTRUCTIONS");
    expect(prompt).toContain("Always use tabs for indentation.");
  });

  it("does not include scoring dimensions for generator", () => {
    const ctx = makeContext({
      criteria: "- Custom criterion",
    });
    const prompt = buildSystemPrompt("generator", ctx);

    expect(prompt).not.toContain("## SCORING DIMENSIONS");
    expect(prompt).not.toContain("## CUSTOM CRITERIA");
  });

  it("does not include scoring dimensions for planner", () => {
    const ctx = makeContext({
      criteria: "- Custom criterion",
    });
    const prompt = buildSystemPrompt("planner", ctx);

    expect(prompt).not.toContain("## SCORING DIMENSIONS");
    expect(prompt).not.toContain("## CUSTOM CRITERIA");
  });

  it("evaluator prompt contains calibration examples", () => {
    const ctx = makeContext();
    const prompt = buildSystemPrompt("evaluator", ctx);

    expect(prompt).toContain("CALIBRATION EXAMPLES");
    expect(prompt).toContain("Correctness = 7");
  });

  it("planner and generator prompts are unchanged", () => {
    const ctx = makeContext();
    const plannerPrompt = buildSystemPrompt("planner", ctx);
    const generatorPrompt = buildSystemPrompt("generator", ctx);

    expect(plannerPrompt).toContain("Focus on WHAT to build, not HOW to implement it");
    expect(generatorPrompt).toContain("Implement EXACTLY what the contract specifies");
  });
});

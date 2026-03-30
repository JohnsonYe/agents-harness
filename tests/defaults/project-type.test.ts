import { describe, it, expect } from "vitest";
import { detectProjectType } from "../../src/defaults/project-type.js";
import type { ProjectContext, Workspace } from "../../src/core/types.js";

function makeWorkspace(overrides: Partial<Workspace["stack"]> = {}, path = "."): Workspace {
  return {
    path,
    stack: {
      language: "typescript",
      framework: null,
      testRunner: null,
      testCommand: "npm test",
      lintCommand: null,
      buildCommand: null,
      devServer: null,
      ...overrides,
    },
    claudeMd: null,
  };
}

function makeCtx(workspaces: Workspace[]): ProjectContext {
  return {
    repoType: workspaces.length > 1 ? "monorepo" : "single",
    workspaces,
    rootClaudeMd: null,
    config: null,
    criteria: null,
    scope: null,
    root: "/tmp/test",
  };
}

describe("detectProjectType", () => {
  it("detects Vite + TypeScript as frontend", () => {
    const ctx = makeCtx([makeWorkspace({ language: "typescript", framework: "vite" })]);
    expect(detectProjectType(ctx)).toBe("frontend");
  });

  it("detects React as frontend", () => {
    const ctx = makeCtx([makeWorkspace({ framework: "react" })]);
    expect(detectProjectType(ctx)).toBe("frontend");
  });

  it("detects Vue as frontend", () => {
    const ctx = makeCtx([makeWorkspace({ framework: "vue" })]);
    expect(detectProjectType(ctx)).toBe("frontend");
  });

  it("detects Svelte as frontend", () => {
    const ctx = makeCtx([makeWorkspace({ framework: "svelte" })]);
    expect(detectProjectType(ctx)).toBe("frontend");
  });

  it("detects Angular as frontend", () => {
    const ctx = makeCtx([makeWorkspace({ framework: "angular" })]);
    expect(detectProjectType(ctx)).toBe("frontend");
  });

  it("detects Django + Python as backend", () => {
    const ctx = makeCtx([makeWorkspace({ language: "python", framework: "django" })]);
    expect(detectProjectType(ctx)).toBe("backend");
  });

  it("detects FastAPI as backend", () => {
    const ctx = makeCtx([makeWorkspace({ language: "python", framework: "fastapi" })]);
    expect(detectProjectType(ctx)).toBe("backend");
  });

  it("detects Express as backend", () => {
    const ctx = makeCtx([makeWorkspace({ language: "typescript", framework: "express" })]);
    expect(detectProjectType(ctx)).toBe("backend");
  });

  it("detects Go (no framework) as backend", () => {
    const ctx = makeCtx([makeWorkspace({ language: "go" })]);
    expect(detectProjectType(ctx)).toBe("backend");
  });

  it("detects Rust (no framework) as backend", () => {
    const ctx = makeCtx([makeWorkspace({ language: "rust" })]);
    expect(detectProjectType(ctx)).toBe("backend");
  });

  it("detects Next.js as fullstack", () => {
    const ctx = makeCtx([makeWorkspace({ framework: "nextjs" })]);
    expect(detectProjectType(ctx)).toBe("fullstack");
  });

  it("detects monorepo with React + FastAPI as fullstack", () => {
    const ctx = makeCtx([
      makeWorkspace({ framework: "react" }, "packages/frontend"),
      makeWorkspace({ language: "python", framework: "fastapi" }, "packages/api"),
    ]);
    expect(detectProjectType(ctx)).toBe("fullstack");
  });

  it("returns universal for unknown stacks", () => {
    const ctx = makeCtx([makeWorkspace({ language: "typescript" })]);
    expect(detectProjectType(ctx)).toBe("universal");
  });

  it("detects devServer-only workspace as frontend", () => {
    const ctx = makeCtx([makeWorkspace({ language: "typescript", devServer: "vite dev" })]);
    expect(detectProjectType(ctx)).toBe("frontend");
  });
});

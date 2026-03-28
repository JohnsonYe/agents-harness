import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildProjectContext } from "../../src/discovery/project-context.js";

let tempDirs: string[] = [];

function createTemp(): string {
  const dir = mkdtempSync(join(tmpdir(), "harness-ctx-test-"));
  tempDirs.push(dir);
  return dir;
}

function writeJson(dir: string, filename: string, data: unknown): void {
  writeFileSync(join(dir, filename), JSON.stringify(data, null, 2));
}

function touch(dir: string, ...filenames: string[]): void {
  for (const f of filenames) {
    const fullPath = join(dir, f);
    const parent = fullPath.substring(0, fullPath.lastIndexOf("/"));
    mkdirSync(parent, { recursive: true });
    writeFileSync(fullPath, "");
  }
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe("buildProjectContext", () => {
  it("builds context for a simple TypeScript project", () => {
    const root = createTemp();
    writeJson(root, "package.json", {
      scripts: { test: "vitest run", lint: "eslint ." },
    });
    touch(root, "vitest.config.ts");

    const ctx = buildProjectContext(root, null);

    expect(ctx.root).toBe(root);
    expect(ctx.repoType).toBe("single");
    expect(ctx.workspaces).toHaveLength(1);
    expect(ctx.workspaces[0].path).toBe(".");
    expect(ctx.workspaces[0].stack.language).toBe("typescript");
    expect(ctx.workspaces[0].stack.testRunner).toBe("vitest");
    expect(ctx.rootClaudeMd).toBeNull();
    expect(ctx.config).toBeNull();
    expect(ctx.criteria).toBeNull();
    expect(ctx.scope).toBeNull();
  });

  it("builds context for a monorepo with multiple workspaces", () => {
    const root = createTemp();
    writeJson(root, "package.json", {
      workspaces: ["packages/*"],
    });

    const frontendDir = join(root, "packages", "frontend");
    mkdirSync(frontendDir, { recursive: true });
    writeJson(frontendDir, "package.json", {
      scripts: { test: "vitest", dev: "vite dev" },
    });
    touch(frontendDir, "vite.config.ts");

    const backendDir = join(root, "packages", "backend");
    mkdirSync(backendDir, { recursive: true });
    writeJson(backendDir, "package.json", {
      scripts: { test: "jest" },
    });

    const ctx = buildProjectContext(root, null);

    expect(ctx.root).toBe(root);
    expect(ctx.repoType).toBe("monorepo");
    expect(ctx.workspaces.length).toBeGreaterThanOrEqual(2);

    const frontend = ctx.workspaces.find((w) => w.path.includes("frontend"));
    const backend = ctx.workspaces.find((w) => w.path.includes("backend"));

    expect(frontend).toBeDefined();
    expect(frontend!.stack.framework).toBe("vite");

    expect(backend).toBeDefined();
    expect(backend!.stack.testRunner).toBe("jest");
  });

  it("merges config overrides into context when .harness/config.yaml exists", () => {
    const root = createTemp();
    writeJson(root, "package.json", {
      scripts: { test: "vitest run" },
    });

    mkdirSync(join(root, ".harness"), { recursive: true });
    writeFileSync(
      join(root, ".harness", "config.yaml"),
      [
        "agents:",
        "  planner:",
        "    model: sonnet",
        "    max_turns: 15",
        "max_attempts_per_sprint: 5",
        "max_budget_per_sprint_usd: 25",
      ].join("\n")
    );

    const ctx = buildProjectContext(root, null);

    expect(ctx.config).not.toBeNull();
    expect(ctx.config!.agents!.planner!.model).toBe("sonnet");
    expect(ctx.config!.agents!.planner!.maxTurns).toBe(15);
    expect(ctx.config!.maxAttemptsPerSprint).toBe(5);
    expect(ctx.config!.maxBudgetPerSprintUsd).toBe(25);
  });

  it("applies scope filter (scope passed through)", () => {
    const root = createTemp();
    writeJson(root, "package.json", {
      scripts: { test: "vitest" },
    });

    const scope = ["packages/frontend", "packages/shared"];
    const ctx = buildProjectContext(root, scope);

    expect(ctx.scope).toEqual(["packages/frontend", "packages/shared"]);
  });

  it("reads .claude/CLAUDE.md into rootClaudeMd field", () => {
    const root = createTemp();
    writeJson(root, "package.json", {
      scripts: { test: "vitest" },
    });
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(
      join(root, ".claude", "CLAUDE.md"),
      "# Project Instructions\nUse vitest for tests."
    );

    const ctx = buildProjectContext(root, null);

    expect(ctx.rootClaudeMd).toBe(
      "# Project Instructions\nUse vitest for tests."
    );
  });

  it("reads root-level CLAUDE.md when .claude/CLAUDE.md is absent", () => {
    const root = createTemp();
    writeJson(root, "package.json", {
      scripts: { test: "vitest" },
    });
    writeFileSync(join(root, "CLAUDE.md"), "# Root Level Instructions");

    const ctx = buildProjectContext(root, null);

    expect(ctx.rootClaudeMd).toBe("# Root Level Instructions");
  });

  it("prefers .claude/CLAUDE.md over root-level CLAUDE.md", () => {
    const root = createTemp();
    writeJson(root, "package.json", {
      scripts: { test: "vitest" },
    });
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude", "CLAUDE.md"), "dot-claude version");
    writeFileSync(join(root, "CLAUDE.md"), "root version");

    const ctx = buildProjectContext(root, null);

    expect(ctx.rootClaudeMd).toBe("dot-claude version");
  });

  it("loads criteria when .harness/criteria.md exists", () => {
    const root = createTemp();
    writeJson(root, "package.json", {
      scripts: { test: "vitest" },
    });
    mkdirSync(join(root, ".harness"), { recursive: true });
    writeFileSync(
      join(root, ".harness", "criteria.md"),
      "# Acceptance Criteria\n- Tests pass"
    );

    const ctx = buildProjectContext(root, null);

    expect(ctx.criteria).toBe("# Acceptance Criteria\n- Tests pass");
  });
});

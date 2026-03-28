import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { detectStack, detectRepoType, discoverWorkspaces } from "../../src/discovery/stack-detector.js";
import type { Stack, Workspace } from "../../src/core/types.js";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "harness-test-"));
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

describe("detectStack", () => {
  it("detects TypeScript + Next.js project", () => {
    const root = createTemp();
    writeJson(root, "package.json", {
      scripts: {
        test: "vitest run",
        lint: "eslint .",
        build: "next build",
        dev: "next dev",
      },
    });
    touch(root, "next.config.mjs");
    touch(root, "vitest.config.ts");

    const stack = detectStack(root);

    expect(stack.language).toBe("typescript");
    expect(stack.framework).toBe("nextjs");
    expect(stack.testRunner).toBe("vitest");
    expect(stack.testCommand).toBe("vitest run");
    expect(stack.lintCommand).toBe("eslint .");
    expect(stack.buildCommand).toBe("next build");
    expect(stack.devServer).toBe("next dev");
  });

  it("detects Python + Django project", () => {
    const root = createTemp();
    touch(root, "requirements.txt");
    touch(root, "manage.py");
    touch(root, "pytest.ini");

    const stack = detectStack(root);

    expect(stack.language).toBe("python");
    expect(stack.framework).toBe("django");
    expect(stack.testRunner).toBe("pytest");
    expect(stack.testCommand).toBe("pytest");
    expect(stack.devServer).toBe("python manage.py runserver");
  });

  it("detects Rust project", () => {
    const root = createTemp();
    touch(root, "Cargo.toml");

    const stack = detectStack(root);

    expect(stack.language).toBe("rust");
    expect(stack.framework).toBeNull();
    expect(stack.testRunner).toBe("cargo test");
    expect(stack.testCommand).toBe("cargo test");
    expect(stack.lintCommand).toBe("cargo clippy");
    expect(stack.buildCommand).toBe("cargo build");
  });

  it("detects Go project", () => {
    const root = createTemp();
    touch(root, "go.mod");

    const stack = detectStack(root);

    expect(stack.language).toBe("go");
    expect(stack.framework).toBeNull();
    expect(stack.testRunner).toBe("go test");
    expect(stack.testCommand).toBe("go test ./...");
    expect(stack.lintCommand).toBe("go vet ./...");
    expect(stack.buildCommand).toBe("go build ./...");
  });

  it("returns 'unknown' for empty directory", () => {
    const root = createTemp();

    const stack = detectStack(root);

    expect(stack.language).toBe("unknown");
    expect(stack.framework).toBeNull();
    expect(stack.testRunner).toBeNull();
    expect(stack.testCommand).toBe("");
    expect(stack.lintCommand).toBeNull();
    expect(stack.buildCommand).toBeNull();
    expect(stack.devServer).toBeNull();
  });

  it("detects vitest from package.json scripts.test fallback", () => {
    const root = createTemp();
    writeJson(root, "package.json", {
      scripts: { test: "vitest run" },
    });

    const stack = detectStack(root);

    expect(stack.testRunner).toBe("vitest");
    expect(stack.testCommand).toBe("vitest run");
  });

  it("detects jest from package.json scripts.test fallback", () => {
    const root = createTemp();
    writeJson(root, "package.json", {
      scripts: { test: "jest --coverage" },
    });

    const stack = detectStack(root);

    expect(stack.testRunner).toBe("jest");
    expect(stack.testCommand).toBe("jest --coverage");
  });

  it("detects pytest from pyproject.toml with [tool.pytest] section", () => {
    const root = createTemp();
    touch(root, "pyproject.toml");
    writeFileSync(
      join(root, "pyproject.toml"),
      "[tool.pytest.ini_options]\naddopts = '-v'\n"
    );

    const stack = detectStack(root);

    expect(stack.language).toBe("python");
    expect(stack.testRunner).toBe("pytest");
  });

  it("detects pytest from conftest.py", () => {
    const root = createTemp();
    touch(root, "requirements.txt");
    touch(root, "conftest.py");

    const stack = detectStack(root);

    expect(stack.testRunner).toBe("pytest");
    expect(stack.testCommand).toBe("pytest");
  });

  it("detects vite framework", () => {
    const root = createTemp();
    writeJson(root, "package.json", {
      scripts: { test: "vitest", dev: "vite dev", build: "vite build" },
    });
    touch(root, "vite.config.ts");

    const stack = detectStack(root);

    expect(stack.framework).toBe("vite");
  });
});

describe("detectRepoType", () => {
  it("detects npm workspaces monorepo", () => {
    const root = createTemp();
    writeJson(root, "package.json", {
      workspaces: ["packages/*"],
    });

    expect(detectRepoType(root)).toBe("monorepo");
  });

  it("detects pnpm monorepo", () => {
    const root = createTemp();
    writeJson(root, "package.json", {});
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");

    expect(detectRepoType(root)).toBe("monorepo");
  });

  it("detects lerna monorepo", () => {
    const root = createTemp();
    writeJson(root, "package.json", {});
    writeJson(root, "lerna.json", { packages: ["packages/*"] });

    expect(detectRepoType(root)).toBe("monorepo");
  });

  it("detects single repo", () => {
    const root = createTemp();
    writeJson(root, "package.json", {
      scripts: { test: "vitest" },
    });

    expect(detectRepoType(root)).toBe("single");
  });

  it("detects monorepo from convention (2+ subdirs with stack markers)", () => {
    const root = createTemp();
    // No package.json workspaces, no pnpm-workspace, no lerna
    // But 2+ subdirectories each containing their own package.json
    mkdirSync(join(root, "frontend"), { recursive: true });
    writeJson(join(root, "frontend"), "package.json", { name: "frontend" });

    mkdirSync(join(root, "backend"), { recursive: true });
    writeJson(join(root, "backend"), "package.json", { name: "backend" });

    expect(detectRepoType(root)).toBe("monorepo");
  });
});

describe("discoverWorkspaces", () => {
  it("returns single workspace for single repo", () => {
    const root = createTemp();
    writeJson(root, "package.json", {
      scripts: { test: "vitest run", lint: "eslint ." },
    });

    const workspaces = discoverWorkspaces(root);

    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].path).toBe(".");
    expect(workspaces[0].stack.language).toBe("typescript");
    expect(workspaces[0].stack.testCommand).toBe("vitest run");
    expect(workspaces[0].claudeMd).toBeNull();
  });

  it("returns multiple workspaces for monorepo", () => {
    const root = createTemp();
    writeJson(root, "package.json", {
      workspaces: ["packages/*"],
    });

    // Create two workspace directories
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

    const workspaces = discoverWorkspaces(root);

    expect(workspaces.length).toBeGreaterThanOrEqual(2);

    const frontend = workspaces.find((w) => w.path.includes("frontend"));
    const backend = workspaces.find((w) => w.path.includes("backend"));

    expect(frontend).toBeDefined();
    expect(frontend!.stack.framework).toBe("vite");
    expect(frontend!.stack.testRunner).toBe("vitest");

    expect(backend).toBeDefined();
    expect(backend!.stack.testRunner).toBe("jest");
  });

  it("reads CLAUDE.md for workspace", () => {
    const root = createTemp();
    writeJson(root, "package.json", {
      scripts: { test: "vitest" },
    });
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude", "CLAUDE.md"), "# Project Instructions\nUse vitest.");

    const workspaces = discoverWorkspaces(root);

    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].claudeMd).toBe("# Project Instructions\nUse vitest.");
  });

  it("reads root-level CLAUDE.md when .claude/CLAUDE.md is absent", () => {
    const root = createTemp();
    writeJson(root, "package.json", {
      scripts: { test: "vitest" },
    });
    writeFileSync(join(root, "CLAUDE.md"), "# Root Instructions");

    const workspaces = discoverWorkspaces(root);

    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].claudeMd).toBe("# Root Instructions");
  });
});

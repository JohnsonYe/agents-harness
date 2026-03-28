import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { Stack, Workspace } from "../core/types.js";

// --- File helpers ---

function fileExists(root: string, ...segments: string[]): boolean {
  return existsSync(join(root, ...segments));
}

function readFileSafe(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

function readJson(path: string): Record<string, unknown> | null {
  const raw = readFileSafe(path);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function anyFileExists(root: string, names: string[]): boolean {
  return names.some((n) => fileExists(root, n));
}

// --- Language detection ---

function detectLanguage(root: string): string {
  if (fileExists(root, "package.json")) return "typescript";
  if (fileExists(root, "requirements.txt") || fileExists(root, "pyproject.toml"))
    return "python";
  if (fileExists(root, "Cargo.toml")) return "rust";
  if (fileExists(root, "go.mod")) return "go";
  return "unknown";
}

// --- Framework detection ---

function detectFramework(root: string): string | null {
  if (
    anyFileExists(root, [
      "next.config.js",
      "next.config.mjs",
      "next.config.ts",
    ])
  )
    return "nextjs";

  if (
    anyFileExists(root, [
      "vite.config.js",
      "vite.config.ts",
      "vite.config.mjs",
    ])
  )
    return "vite";

  if (fileExists(root, "manage.py")) return "django";

  return null;
}

// --- Test runner detection ---

function detectTestRunner(
  root: string,
  language: string,
  pkgJson: Record<string, unknown> | null
): string | null {
  // Config-file-based detection (highest priority)
  if (
    anyFileExists(root, [
      "vitest.config.ts",
      "vitest.config.js",
      "vitest.config.mjs",
    ])
  )
    return "vitest";

  if (
    anyFileExists(root, [
      "jest.config.ts",
      "jest.config.js",
      "jest.config.mjs",
      "jest.config.cjs",
    ])
  )
    return "jest";

  // Python test runners
  if (fileExists(root, "pytest.ini")) return "pytest";
  if (fileExists(root, "conftest.py")) return "pytest";

  // Check pyproject.toml for [tool.pytest] section
  if (fileExists(root, "pyproject.toml")) {
    const content = readFileSafe(join(root, "pyproject.toml"));
    if (content && content.includes("[tool.pytest")) return "pytest";
  }

  // Rust and Go have built-in test runners
  if (language === "rust") return "cargo test";
  if (language === "go") return "go test";

  // Fallback: inspect package.json scripts.test
  if (pkgJson) {
    const scripts = pkgJson.scripts as Record<string, string> | undefined;
    const testScript = scripts?.test;
    if (testScript) {
      if (testScript.includes("vitest")) return "vitest";
      if (testScript.includes("jest")) return "jest";
      if (testScript.includes("mocha")) return "mocha";
    }
  }

  return null;
}

// --- Command detection ---

function detectTestCommand(
  runner: string | null,
  pkgJson: Record<string, unknown> | null
): string {
  // Prefer package.json scripts.test
  if (pkgJson) {
    const scripts = pkgJson.scripts as Record<string, string> | undefined;
    if (scripts?.test) return scripts.test;
  }

  // Fallback based on runner
  if (runner === "pytest") return "pytest";
  if (runner === "cargo test") return "cargo test";
  if (runner === "go test") return "go test ./...";

  return "";
}

function detectLintCommand(
  language: string,
  pkgJson: Record<string, unknown> | null
): string | null {
  if (pkgJson) {
    const scripts = pkgJson.scripts as Record<string, string> | undefined;
    if (scripts?.lint) return scripts.lint;
  }

  if (language === "python") return "ruff check .";
  if (language === "rust") return "cargo clippy";
  if (language === "go") return "go vet ./...";

  return null;
}

function detectBuildCommand(
  language: string,
  pkgJson: Record<string, unknown> | null
): string | null {
  if (pkgJson) {
    const scripts = pkgJson.scripts as Record<string, string> | undefined;
    if (scripts?.build) return scripts.build;
  }

  if (language === "rust") return "cargo build";
  if (language === "go") return "go build ./...";

  return null;
}

function detectDevServer(
  root: string,
  pkgJson: Record<string, unknown> | null
): string | null {
  if (pkgJson) {
    const scripts = pkgJson.scripts as Record<string, string> | undefined;
    if (scripts?.dev) return scripts.dev;
    if (scripts?.start) return scripts.start;
  }

  if (fileExists(root, "manage.py")) return "python manage.py runserver";

  return null;
}

// --- Public API ---

/**
 * Detect the technology stack for a project rooted at `root`.
 */
export function detectStack(root: string): Stack {
  const pkgJson = readJson(join(root, "package.json"));
  const language = detectLanguage(root);
  const framework = detectFramework(root);
  const testRunner = detectTestRunner(root, language, pkgJson);
  const testCommand = detectTestCommand(testRunner, pkgJson);
  const lintCommand = detectLintCommand(language, pkgJson);
  const buildCommand = detectBuildCommand(language, pkgJson);
  const devServer = detectDevServer(root, pkgJson);

  return {
    language,
    framework,
    testRunner,
    testCommand,
    lintCommand,
    buildCommand,
    devServer,
  };
}

/**
 * Determine whether the project at `root` is a single repo or a monorepo.
 */
export function detectRepoType(root: string): "single" | "monorepo" {
  // Check package.json workspaces
  const pkgJson = readJson(join(root, "package.json"));
  if (pkgJson?.workspaces) return "monorepo";

  // Check pnpm-workspace.yaml
  if (fileExists(root, "pnpm-workspace.yaml")) return "monorepo";

  // Check lerna.json
  if (fileExists(root, "lerna.json")) return "monorepo";

  // Convention: 2+ subdirectories with their own stack markers
  const stackMarkers = [
    "package.json",
    "requirements.txt",
    "pyproject.toml",
    "Cargo.toml",
    "go.mod",
  ];

  try {
    const entries = readdirSync(root, { withFileTypes: true });
    let stackDirCount = 0;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".") || entry.name === "node_modules")
        continue;

      const subdir = join(root, entry.name);
      if (stackMarkers.some((marker) => existsSync(join(subdir, marker)))) {
        stackDirCount++;
      }
      if (stackDirCount >= 2) return "monorepo";
    }
  } catch {
    // ignore read errors
  }

  return "single";
}

/**
 * Read CLAUDE.md for a given directory.
 * Checks .claude/CLAUDE.md first, then CLAUDE.md at the directory root.
 */
function readClaudeMd(dir: string): string | null {
  const dotClaudePath = join(dir, ".claude", "CLAUDE.md");
  const rootPath = join(dir, "CLAUDE.md");

  return readFileSafe(dotClaudePath) ?? readFileSafe(rootPath);
}

/**
 * Discover workspaces in the project at `root`.
 * For a single repo, returns a single workspace at ".".
 * For a monorepo, returns one workspace per detected sub-project.
 */
export function discoverWorkspaces(root: string): Workspace[] {
  const repoType = detectRepoType(root);

  if (repoType === "single") {
    return [
      {
        path: ".",
        stack: detectStack(root),
        claudeMd: readClaudeMd(root),
      },
    ];
  }

  // Monorepo: find workspace directories
  const workspaceDirs = findWorkspaceDirs(root);
  return workspaceDirs.map((dir) => ({
    path: relative(root, dir) || ".",
    stack: detectStack(dir),
    claudeMd: readClaudeMd(dir),
  }));
}

/**
 * Resolve workspace directories for a monorepo.
 * Tries package.json workspaces globs, then falls back to scanning subdirectories.
 */
function findWorkspaceDirs(root: string): string[] {
  const pkgJson = readJson(join(root, "package.json"));

  // Try package.json workspaces (array of globs like ["packages/*"])
  if (pkgJson?.workspaces) {
    const patterns = pkgJson.workspaces as string[];
    return resolveGlobPatterns(root, patterns);
  }

  // Try pnpm-workspace.yaml
  if (fileExists(root, "pnpm-workspace.yaml")) {
    const content = readFileSafe(join(root, "pnpm-workspace.yaml"));
    if (content) {
      const patterns = parsePnpmWorkspacePatterns(content);
      if (patterns.length > 0) return resolveGlobPatterns(root, patterns);
    }
  }

  // Fallback: scan subdirectories for stack markers
  return scanForStackDirs(root);
}

/**
 * Resolve simple glob patterns like "packages/*" to actual directories.
 * Only handles single-level wildcards for simplicity.
 */
function resolveGlobPatterns(root: string, patterns: string[]): string[] {
  const dirs: string[] = [];

  for (const pattern of patterns) {
    if (pattern.endsWith("/*")) {
      const parent = join(root, pattern.slice(0, -2));
      try {
        const entries = readdirSync(parent, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith(".")) {
            dirs.push(join(parent, entry.name));
          }
        }
      } catch {
        // parent directory doesn't exist, skip
      }
    } else {
      // Direct path
      const dir = join(root, pattern);
      if (existsSync(dir) && statSync(dir).isDirectory()) {
        dirs.push(dir);
      }
    }
  }

  return dirs;
}

/**
 * Parse pnpm-workspace.yaml to extract package patterns.
 * Simple line-based parser — no YAML library needed for this format.
 */
function parsePnpmWorkspacePatterns(content: string): string[] {
  const patterns: string[] = [];
  const lines = content.split("\n");
  let inPackages = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "packages:") {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      if (trimmed.startsWith("- ")) {
        const value = trimmed.slice(2).replace(/['"]/g, "").trim();
        if (value) patterns.push(value);
      } else if (trimmed && !trimmed.startsWith("#")) {
        // New top-level key, stop parsing
        break;
      }
    }
  }

  return patterns;
}

/**
 * Scan root's immediate subdirectories for any that contain stack markers.
 */
function scanForStackDirs(root: string): string[] {
  const stackMarkers = [
    "package.json",
    "requirements.txt",
    "pyproject.toml",
    "Cargo.toml",
    "go.mod",
  ];
  const dirs: string[] = [];

  try {
    const entries = readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

      const subdir = join(root, entry.name);
      if (stackMarkers.some((marker) => existsSync(join(subdir, marker)))) {
        dirs.push(subdir);
      }
    }
  } catch {
    // ignore read errors
  }

  return dirs;
}

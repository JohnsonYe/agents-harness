import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, loadCriteria } from "../../src/discovery/config-loader.js";

let tempDirs: string[] = [];

function createTemp(): string {
  const dir = mkdtempSync(join(tmpdir(), "harness-config-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe("loadConfig", () => {
  it("returns null when no config exists", () => {
    const root = createTemp();

    const config = loadConfig(root);

    expect(config).toBeNull();
  });

  it("loads and parses config.yaml with snake_case to camelCase conversion", () => {
    const root = createTemp();
    mkdirSync(join(root, ".harness"), { recursive: true });
    writeFileSync(
      join(root, ".harness", "config.yaml"),
      [
        "agents:",
        "  planner:",
        "    model: sonnet",
        "    max_turns: 15",
        "    system_prompt_append: 'Be concise'",
        "  generator:",
        "    model: opus",
        "    max_turns: 50",
        "workspaces:",
        "  frontend:",
        "    path: packages/frontend",
        "    language: typescript",
        "    framework: nextjs",
        "    test_command: vitest run",
        "    lint_command: eslint .",
        "    build_command: next build",
        "    dev_server: next dev",
        "max_attempts_per_sprint: 5",
        "max_budget_per_sprint_usd: 25",
        "max_total_budget_usd: 200",
      ].join("\n")
    );

    const config = loadConfig(root);

    expect(config).not.toBeNull();

    // Top-level keys converted
    expect(config!.maxAttemptsPerSprint).toBe(5);
    expect(config!.maxBudgetPerSprintUsd).toBe(25);
    expect(config!.maxTotalBudgetUsd).toBe(200);

    // Agent config keys converted
    expect(config!.agents).toBeDefined();
    expect(config!.agents!.planner).toBeDefined();
    expect(config!.agents!.planner!.model).toBe("sonnet");
    expect(config!.agents!.planner!.maxTurns).toBe(15);
    expect(config!.agents!.planner!.systemPromptAppend).toBe("Be concise");
    expect(config!.agents!.generator).toBeDefined();
    expect(config!.agents!.generator!.model).toBe("opus");
    expect(config!.agents!.generator!.maxTurns).toBe(50);

    // Workspace config keys converted
    expect(config!.workspaces).toBeDefined();
    expect(config!.workspaces!.frontend).toBeDefined();
    expect(config!.workspaces!.frontend.path).toBe("packages/frontend");
    expect(config!.workspaces!.frontend.language).toBe("typescript");
    expect(config!.workspaces!.frontend.framework).toBe("nextjs");
    expect(config!.workspaces!.frontend.testCommand).toBe("vitest run");
    expect(config!.workspaces!.frontend.lintCommand).toBe("eslint .");
    expect(config!.workspaces!.frontend.buildCommand).toBe("next build");
    expect(config!.workspaces!.frontend.devServer).toBe("next dev");
  });
});

describe("loadCriteria", () => {
  it("returns null when no criteria file exists", () => {
    const root = createTemp();

    const criteria = loadCriteria(root);

    expect(criteria).toBeNull();
  });

  it("loads criteria.md content", () => {
    const root = createTemp();
    mkdirSync(join(root, ".harness"), { recursive: true });
    const content = [
      "# Acceptance Criteria",
      "",
      "- Users can sign in with email/password",
      "- Dashboard shows real-time updates",
      "- All API endpoints return proper error codes",
    ].join("\n");
    writeFileSync(join(root, ".harness", "criteria.md"), content);

    const criteria = loadCriteria(root);

    expect(criteria).toBe(content);
  });
});

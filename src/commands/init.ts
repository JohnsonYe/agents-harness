import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify as toYaml } from "yaml";
import { buildProjectContext } from "../discovery/project-context.js";

export function initCommand(): void {
  const root = process.cwd();
  const harnessDir = join(root, ".harness");
  const configPath = join(harnessDir, "config.yaml");

  if (existsSync(configPath)) {
    console.log(".harness/config.yaml already exists. Skipping init.");
    return;
  }

  // Run project discovery
  const ctx = buildProjectContext(root, null);

  console.log("Detected project:");
  console.log(`  Repository type: ${ctx.repoType}`);
  for (const ws of ctx.workspaces) {
    console.log(`  Workspace: ${ws.path}`);
    console.log(`    Language: ${ws.stack.language}`);
    if (ws.stack.framework) {
      console.log(`    Framework: ${ws.stack.framework}`);
    }
    if (ws.stack.testRunner) {
      console.log(`    Test runner: ${ws.stack.testRunner}`);
    }
    console.log(`    Test command: ${ws.stack.testCommand}`);
  }
  if (ctx.rootClaudeMd) {
    console.log("  CLAUDE.md: found");
  }
  console.log("");

  // Scaffold .harness directory
  mkdirSync(harnessDir, { recursive: true });

  // Build initial config from detected values
  const config: Record<string, unknown> = {
    // Agent configuration (defaults shown as comments in the YAML)
    agents: {
      planner: { model: "sonnet" },
      generator: { model: "opus" },
      evaluator: { model: "sonnet" },
    },
    max_attempts_per_sprint: 3,
    max_budget_per_sprint_usd: 5,
    max_total_budget_usd: 50,
  };

  writeFileSync(configPath, toYaml(config), "utf-8");
  console.log("Created .harness/config.yaml");

  // Create criteria.md template
  const criteriaPath = join(harnessDir, "criteria.md");
  if (!existsSync(criteriaPath)) {
    const criteriaTemplate = `# Custom Evaluation Criteria

Add project-specific criteria here. These are checked IN ADDITION to the default criteria.

## Examples (uncomment and customize):
# - All API endpoints must return proper HTTP status codes
# - Database migrations must be reversible
# - All user-facing strings must be internationalized
# - Performance: API responses must be under 200ms
`;
    writeFileSync(criteriaPath, criteriaTemplate, "utf-8");
    console.log("Created .harness/criteria.md");
  }

  console.log("\nDone! Edit .harness/config.yaml to customize settings.");
  console.log("Run 'agents-harness run \"<spec>\"' to start.");
}

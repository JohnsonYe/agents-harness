import { Harness } from "../core/orchestrator.js";
import { DashboardServer } from "../dashboard/server.js";
import { resolveApiKey } from "./config.js";
import type {
  PhaseStartEvent,
  EvaluationEvent,
  SprintCompleteEvent,
  RunCompleteEvent,
  CostUpdateEvent,
  AgentActivityEvent,
} from "../core/types.js";

export interface RunOptions {
  scope?: string[];
  maxAttempts?: number;
  maxBudget?: number;
  dashboard?: boolean;
  port?: number;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export async function runCommand(
  spec: string,
  options: RunOptions,
): Promise<void> {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    console.error("Error: No API key found.");
    console.error(
      "Set ANTHROPIC_API_KEY environment variable or run: agent-harness config set api-key <key>",
    );
    process.exit(1);
  }

  const root = process.cwd();

  console.log("Starting agent-harness run...");
  console.log(`Spec: ${spec.slice(0, 100)}${spec.length > 100 ? "..." : ""}`);
  console.log("");

  const harness = new Harness({
    apiKey,
    root,
    scope: options.scope,
    maxAttemptsPerSprint: options.maxAttempts,
    maxTotalBudgetUsd: options.maxBudget,
  });

  // Attach event listeners for terminal output
  harness.on("phase:start", (data: PhaseStartEvent) => {
    const sprint = data.sprint > 0 ? ` [Sprint ${data.sprint}]` : "";
    const attempt = data.attempt > 0 ? ` (attempt ${data.attempt})` : "";
    console.log(`\n--- ${data.phase.toUpperCase()}${sprint}${attempt} ---`);
  });

  harness.on("agent:activity", (data: AgentActivityEvent) => {
    console.log(`  [${data.role}] ${data.summary}`);
  });

  harness.on("evaluation", (data: EvaluationEvent) => {
    const icon = data.result.passed ? "PASS" : "FAIL";
    console.log(`\n  Evaluation: ${icon}`);
    if (data.result.passedCriteria.length > 0) {
      for (const c of data.result.passedCriteria) {
        console.log(`    + ${c}`);
      }
    }
    if (data.result.failedCriteria.length > 0) {
      for (const c of data.result.failedCriteria) {
        console.log(`    - ${c}`);
      }
    }
    if (!data.result.passed && data.result.critique) {
      console.log(`  Critique: ${data.result.critique.slice(0, 200)}`);
    }
  });

  harness.on("cost:update", (data: CostUpdateEvent) => {
    console.log(
      `  Cost: $${data.totalCostUsd.toFixed(2)} / $${data.budgetUsd.toFixed(2)}`,
    );
  });

  harness.on("sprint:complete", (data: SprintCompleteEvent) => {
    const icon = data.status === "passed" ? "PASS" : "FAIL";
    console.log(
      `\nSprint ${data.sprint}: ${icon} (${data.attempts} attempt${data.attempts > 1 ? "s" : ""}, $${data.costUsd.toFixed(2)})`,
    );
  });

  harness.on("run:complete", (data: RunCompleteEvent) => {
    console.log("\n========================================");
    console.log(`Run ${data.status.toUpperCase()}`);
    console.log(`Sprints: ${data.totalSprints}`);
    console.log(`Total cost: $${data.totalCostUsd.toFixed(2)}`);
    console.log(`Duration: ${formatDuration(data.durationMs)}`);
    console.log("========================================");
  });

  // Dashboard setup
  let dashboard: DashboardServer | null = null;
  if (options.dashboard) {
    dashboard = new DashboardServer(options.port ?? 3117);
    await dashboard.start();
    console.log(`Dashboard: ${dashboard.getUrl()}`);

    // Forward all events to dashboard
    harness.on("event", (event) => {
      dashboard!.broadcast(event);
    });
  }

  // Handle SIGINT for graceful shutdown
  const handleSignal = () => {
    console.log("\nReceived interrupt signal. Stopping...");
    harness.stop();
  };
  process.on("SIGINT", handleSignal);

  try {
    await harness.run(spec);
  } catch (error) {
    console.error(
      `\nRun failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  } finally {
    process.off("SIGINT", handleSignal);
    if (dashboard) {
      await dashboard.stop();
    }
  }
}

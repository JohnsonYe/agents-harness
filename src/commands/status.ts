import { FileProtocol } from "../core/file-protocol.js";
import type { SprintProgress } from "../core/types.js";

function sprintIcon(status: string): string {
  switch (status) {
    case "passed": return "PASS";
    case "failed": return "FAIL";
    case "in_progress": return "....";
    default: return "    ";
  }
}

export function statusCommand(): void {
  const root = process.cwd();
  const fp = new FileProtocol(root);
  const progress = fp.readProgress();

  if (!progress) {
    console.log("No active run found. Run 'agent-harness run \"<spec>\"' to start.");
    return;
  }

  console.log(`Status: ${progress.status.toUpperCase()}`);
  console.log(`Spec: ${progress.runSpec.slice(0, 100)}${progress.runSpec.length > 100 ? "..." : ""}`);
  console.log(`Started: ${progress.startedAt}`);
  if (progress.stoppedAt) {
    console.log(`Stopped: ${progress.stoppedAt}`);
  }
  console.log(`Phase: ${progress.currentPhase}`);
  console.log(`Cost: $${progress.costUsd.toFixed(2)} / $${progress.maxBudgetUsd.toFixed(2)}`);
  console.log("");

  console.log(`Sprints: ${progress.currentSprint} / ${progress.totalSprints}`);
  for (let i = 1; i <= progress.totalSprints; i++) {
    const sprint: SprintProgress | undefined = progress.sprints[i];
    if (sprint) {
      console.log(`  [${sprintIcon(sprint.status)}] Sprint ${i} — ${sprint.attempts} attempt${sprint.attempts !== 1 ? "s" : ""}, $${sprint.costUsd.toFixed(2)}`);
    } else {
      console.log(`  [${sprintIcon("pending")}] Sprint ${i}`);
    }
  }
}

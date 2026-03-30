import { EventEmitter } from "node:events";
import type {
  Progress,
  Phase,
  HarnessEvent,
  AgentRole,
  ProjectContext,
} from "./types.js";
import { ContextManager, type ModelOverrides } from "./context-manager.js";
import { FileProtocol } from "./file-protocol.js";
import { buildProjectContext } from "../discovery/project-context.js";
import { detectProjectType } from "../defaults/project-type.js";
import { getDimensions } from "../defaults/criteria.js";

export interface HarnessOptions {
  apiKey: string;
  root: string;
  scope?: string[];
  maxAttemptsPerSprint?: number; // default: 3
  maxBudgetPerSprintUsd?: number; // default: 5
  maxTotalBudgetUsd?: number; // default: 50
  models?: ModelOverrides;
}

export class Harness extends EventEmitter {
  private contextManager: ContextManager;
  private fileProtocol: FileProtocol;
  private projectContext: ProjectContext;
  private progress: Progress;
  private aborted = false;
  private options: Required<
    Pick<
      HarnessOptions,
      "maxAttemptsPerSprint" | "maxBudgetPerSprintUsd" | "maxTotalBudgetUsd"
    >
  >;

  constructor(opts: HarnessOptions) {
    super();
    const projectContext = buildProjectContext(opts.root, opts.scope ?? null);
    this.projectContext = projectContext;

    // Apply config overrides from .harness/config.yaml
    const config = projectContext.config;
    this.options = {
      maxAttemptsPerSprint:
        opts.maxAttemptsPerSprint ?? config?.maxAttemptsPerSprint ?? 3,
      maxBudgetPerSprintUsd:
        opts.maxBudgetPerSprintUsd ?? config?.maxBudgetPerSprintUsd ?? 5,
      maxTotalBudgetUsd:
        opts.maxTotalBudgetUsd ?? config?.maxTotalBudgetUsd ?? 50,
    };

    this.contextManager = new ContextManager(opts.apiKey, projectContext, opts.models);
    this.fileProtocol = new FileProtocol(opts.root);
    this.progress = this.initProgress("");
  }

  private initProgress(runSpec: string): Progress {
    return {
      status: "running",
      runSpec,
      currentSprint: 0,
      totalSprints: 0,
      currentAttempt: 0,
      currentPhase: "plan",
      startedAt: new Date().toISOString(),
      costUsd: 0,
      maxBudgetUsd: this.options.maxTotalBudgetUsd,
      sprints: {},
    };
  }

  private emitEvent(event: HarnessEvent): void {
    this.emit(event.type, event.data);
    this.emit("event", event);
  }

  private updatePhase(phase: Phase, sprint = 0, attempt = 0): void {
    this.progress.currentPhase = phase;
    this.progress.currentSprint = sprint;
    this.progress.currentAttempt = attempt;
    this.emitEvent({
      type: "phase:start",
      data: { sprint, phase, attempt },
    });
  }

  private async runAgentPhase(
    role: AgentRole,
    prompt: string,
    sprint: number,
  ): Promise<string> {
    const result = await this.contextManager.runAgent({
      role,
      prompt,
      onActivity: (tool, summary) => {
        this.emitEvent({
          type: "agent:activity",
          data: { sprint, role, tool, summary, timestamp: Date.now() },
        });
      },
    });

    this.progress.costUsd += result.costUsd;
    if (this.progress.sprints[sprint]) {
      this.progress.sprints[sprint].costUsd += result.costUsd;
    }

    this.emitEvent({
      type: "cost:update",
      data: {
        sprintCostUsd: this.progress.sprints[sprint]?.costUsd ?? 0,
        totalCostUsd: this.progress.costUsd,
        budgetUsd: this.options.maxTotalBudgetUsd,
      },
    });

    this.fileProtocol.writeProgress(this.progress);
    return result.response;
  }

  private isBudgetExceeded(): boolean {
    return this.progress.costUsd >= this.options.maxTotalBudgetUsd;
  }

  private parseTotalSprints(_plannerResponse: string): number {
    // Read sprints.md to count how many sprints were planned
    const sprints = this.fileProtocol.readFile("sprints.md");
    if (!sprints) return 1;

    // Count sprint headers (## Sprint N or ### Sprint N)
    const matches = sprints.match(/^#{2,3}\s+Sprint\s+\d+/gim);
    return matches ? matches.length : 1;
  }

  async run(spec: string): Promise<void> {
    this.fileProtocol.ensureDir();
    this.fileProtocol.ensureGitignore();
    this.fileProtocol.cleanEphemeral();
    this.progress = this.initProgress(spec);
    this.aborted = false;

    try {
      // Phase 1: Plan — write spec to file, have planner create full spec
      this.updatePhase("plan");
      this.fileProtocol.writeFile("spec.md", spec);
      await this.runAgentPhase(
        "planner",
        `Read .harness/spec.md. Create a comprehensive product specification. Write the full specification back to .harness/spec.md — expand and refine the user's original request into a complete spec.`,
        0,
      );

      if (this.aborted || this.isBudgetExceeded()) return this.finalize();

      // Phase 2: Decompose — break spec into sprints
      this.updatePhase("decompose");
      await this.runAgentPhase(
        "planner",
        `Read .harness/spec.md. Decompose this specification into ordered sprints. Each sprint must be independently testable. Write the sprint plan to .harness/sprints.md.`,
        0,
      );

      if (this.aborted || this.isBudgetExceeded()) return this.finalize();

      const totalSprints = this.parseTotalSprints("");
      this.progress.totalSprints = totalSprints;

      // Execute sprints
      for (let s = 1; s <= totalSprints; s++) {
        if (this.aborted || this.isBudgetExceeded()) break;
        await this.executeSprint(s);
      }
    } catch (error) {
      this.progress.status = "stopped";
      this.progress.stoppedAt = new Date().toISOString();
      this.fileProtocol.writeProgress(this.progress);
      throw error;
    }

    return this.finalize();
  }

  private async executeSprint(sprintNum: number): Promise<void> {
    if (!this.progress.sprints[sprintNum]) {
      this.progress.sprints[sprintNum] = {
        status: "in_progress",
        attempts: 0,
        costUsd: 0,
      };
    } else {
      this.progress.sprints[sprintNum].status = "in_progress";
    }

    // Contract phase — have planner write a contract for this sprint
    this.updatePhase("contract", sprintNum, 0);
    await this.runAgentPhase(
      "planner",
      `Read .harness/sprints.md. Write a sprint contract for Sprint ${sprintNum} to .harness/contract.md. Include specific, testable success criteria.`,
      sprintNum,
    );

    // Attempt loop
    const maxAttempts = this.options.maxAttemptsPerSprint;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (this.aborted || this.isBudgetExceeded()) break;

      this.progress.sprints[sprintNum].attempts = attempt;

      // Generate phase
      this.updatePhase("generate", sprintNum, attempt);
      await this.runAgentPhase(
        "generator",
        `Implement the sprint contract. Read .harness/contract.md for requirements.${attempt > 1 ? " Read .harness/evaluation.md for feedback from your previous attempt." : ""}`,
        sprintNum,
      );

      if (this.aborted || this.isBudgetExceeded()) break;

      // Evaluate phase
      this.updatePhase("evaluate", sprintNum, attempt);
      await this.runAgentPhase(
        "evaluator",
        `Evaluate the implementation against the sprint contract. Read .harness/contract.md for requirements. Write your evaluation to .harness/evaluation.md.`,
        sprintNum,
      );

      // Parse evaluation with scored dimensions
      const projectType = detectProjectType(this.projectContext);
      const dims = getDimensions(projectType);
      const evalResult = this.fileProtocol.parseEvaluation(dims);
      evalResult.projectType = projectType;
      this.emitEvent({
        type: "evaluation",
        data: { sprint: sprintNum, attempt, result: evalResult },
      });

      if (evalResult.passed) {
        this.progress.sprints[sprintNum].status = "passed";
        this.emitEvent({
          type: "sprint:complete",
          data: {
            sprint: sprintNum,
            status: "passed",
            attempts: attempt,
            costUsd: this.progress.sprints[sprintNum].costUsd,
          },
        });

        // Handoff phase — write context for next sprint
        if (sprintNum < this.progress.totalSprints) {
          this.updatePhase("handoff", sprintNum);
          await this.runAgentPhase(
            "planner",
            `Sprint ${sprintNum} passed. Write a handoff document to .harness/handoff.md summarizing what was done, what changed, and key context the next sprint needs.`,
            sprintNum,
          );
        }

        return; // sprint passed, move to next
      }

      // If last attempt and still failing
      if (attempt === maxAttempts) {
        this.progress.sprints[sprintNum].status = "failed";
        this.emitEvent({
          type: "sprint:complete",
          data: {
            sprint: sprintNum,
            status: "failed",
            attempts: attempt,
            costUsd: this.progress.sprints[sprintNum].costUsd,
          },
        });
      }
    }
  }

  private finalize(): void {
    if (this.aborted) {
      this.progress.status = "stopped";
      this.progress.stoppedAt = new Date().toISOString();
    } else {
      // Check if all sprints passed
      const allPassed = Object.values(this.progress.sprints).every(
        (s) => s.status === "passed",
      );
      this.progress.status = allPassed ? "completed" : "failed";
    }

    this.fileProtocol.writeProgress(this.progress);

    const startMs = new Date(this.progress.startedAt).getTime();
    const endMs = Date.now();

    this.emitEvent({
      type: "run:complete",
      data: {
        status: this.progress.status,
        totalSprints: this.progress.totalSprints,
        totalCostUsd: this.progress.costUsd,
        durationMs: endMs - startMs,
      },
    });
  }

  async resume(): Promise<void> {
    const saved = this.fileProtocol.readProgress();
    if (!saved) {
      throw new Error("No progress file found. Nothing to resume.");
    }

    this.progress = { ...saved, status: "running" };
    this.aborted = false;
    delete this.progress.stoppedAt;

    // Resume from the current sprint
    const startSprint = this.progress.currentSprint || 1;
    for (let s = startSprint; s <= this.progress.totalSprints; s++) {
      if (this.aborted || this.isBudgetExceeded()) break;
      const sprintProgress = this.progress.sprints[s];
      if (sprintProgress?.status === "passed") continue; // skip completed sprints
      await this.executeSprint(s);
    }

    return this.finalize();
  }

  stop(): void {
    this.aborted = true;
    this.progress.status = "stopped";
    this.progress.stoppedAt = new Date().toISOString();
    this.fileProtocol.writeProgress(this.progress);
  }

  getProgress(): Progress {
    return { ...this.progress };
  }

  getModels(): Record<string, string> {
    return {
      planner: this.contextManager.getModelForRole("planner"),
      generator: this.contextManager.getModelForRole("generator"),
      evaluator: this.contextManager.getModelForRole("evaluator"),
    };
  }
}

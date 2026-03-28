// --- Project Discovery Types ---

export interface Stack {
  language: string;
  framework: string | null;
  testRunner: string | null;
  testCommand: string;
  lintCommand: string | null;
  buildCommand: string | null;
  devServer: string | null;
}

export interface Workspace {
  path: string;
  stack: Stack;
  claudeMd: string | null;
}

export interface ProjectContext {
  repoType: "single" | "monorepo";
  workspaces: Workspace[];
  rootClaudeMd: string | null;
  config: HarnessConfig | null;
  criteria: string | null;
  scope: string[] | null;
  root: string;
}

// --- Harness Config Types (from config.yaml) ---

export interface AgentConfig {
  model?: string;
  maxTurns?: number;
  systemPromptAppend?: string;
}

export interface WorkspaceConfig {
  path: string;
  language?: string;
  framework?: string;
  testCommand?: string;
  lintCommand?: string;
  buildCommand?: string;
  devServer?: string;
}

export interface HarnessConfig {
  agents?: {
    planner?: AgentConfig;
    generator?: AgentConfig;
    evaluator?: AgentConfig;
  };
  workspaces?: Record<string, WorkspaceConfig>;
  maxAttemptsPerSprint?: number;
  maxBudgetPerSprintUsd?: number;
  maxTotalBudgetUsd?: number;
}

// --- Orchestration Types ---

export type SprintStatus = "pending" | "in_progress" | "passed" | "failed";
export type RunStatus = "running" | "stopped" | "completed" | "failed";
export type Phase = "plan" | "decompose" | "contract" | "generate" | "evaluate" | "handoff";

export interface SprintProgress {
  status: SprintStatus;
  attempts: number;
  costUsd: number;
}

export interface Progress {
  status: RunStatus;
  runSpec: string;
  currentSprint: number;
  totalSprints: number;
  currentAttempt: number;
  currentPhase: Phase;
  startedAt: string;
  stoppedAt?: string;
  costUsd: number;
  maxBudgetUsd: number;
  sprints: Record<number, SprintProgress>;
}

export interface EvalResult {
  passed: boolean;
  critique: string;
  failedCriteria: string[];
  passedCriteria: string[];
}

// --- Agent Role Types ---

export type AgentRole = "planner" | "generator" | "evaluator";

export interface AgentDefinition {
  role: AgentRole;
  systemPrompt: string;
  tools: string[];
  model: string;
  maxTurns: number;
}

// --- Event Types ---

export interface PhaseStartEvent {
  sprint: number;
  phase: Phase;
  attempt: number;
}

export interface AgentActivityEvent {
  sprint: number;
  role: AgentRole;
  tool: string;
  summary: string;
  timestamp: number;
}

export interface EvaluationEvent {
  sprint: number;
  attempt: number;
  result: EvalResult;
}

export interface CostUpdateEvent {
  sprintCostUsd: number;
  totalCostUsd: number;
  budgetUsd: number;
}

export interface SprintCompleteEvent {
  sprint: number;
  status: SprintStatus;
  attempts: number;
  costUsd: number;
}

export interface RunCompleteEvent {
  status: RunStatus;
  totalSprints: number;
  totalCostUsd: number;
  durationMs: number;
}

export type HarnessEvent =
  | { type: "phase:start"; data: PhaseStartEvent }
  | { type: "agent:activity"; data: AgentActivityEvent }
  | { type: "evaluation"; data: EvaluationEvent }
  | { type: "cost:update"; data: CostUpdateEvent }
  | { type: "sprint:complete"; data: SprintCompleteEvent }
  | { type: "run:complete"; data: RunCompleteEvent };

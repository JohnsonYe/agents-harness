// Core
export { Harness } from "./core/orchestrator.js";
export type { HarnessOptions } from "./core/orchestrator.js";
export { ContextManager } from "./core/context-manager.js";
export type { AgentResult, RunAgentOptions } from "./core/context-manager.js";
export { FileProtocol } from "./core/file-protocol.js";

// Discovery
export { buildProjectContext } from "./discovery/project-context.js";
export { detectStack, detectRepoType, discoverWorkspaces } from "./discovery/stack-detector.js";
export { loadConfig, loadCriteria } from "./discovery/config-loader.js";

// Defaults
export { buildSystemPrompt, formatProjectContext } from "./defaults/prompts.js";
export { DEFAULT_CRITERIA } from "./defaults/criteria.js";

// Dashboard
export { DashboardServer } from "./dashboard/server.js";

// Types — re-export everything
export type {
  Stack,
  Workspace,
  ProjectContext,
  AgentConfig,
  WorkspaceConfig,
  HarnessConfig,
  SprintStatus,
  RunStatus,
  Phase,
  SprintProgress,
  Progress,
  EvalResult,
  AgentRole,
  AgentDefinition,
  PhaseStartEvent,
  AgentActivityEvent,
  EvaluationEvent,
  CostUpdateEvent,
  SprintCompleteEvent,
  RunCompleteEvent,
  HarnessEvent,
} from "./core/types.js";

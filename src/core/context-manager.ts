import type { AgentRole, ProjectContext } from "./types.js";
import { buildSystemPrompt } from "../defaults/prompts.js";

// Model mapping
const MODEL_MAP: Record<string, string> = {
  opus: "claude-opus-4-6",
  sonnet: "claude-sonnet-4-5-20250929",
  haiku: "claude-haiku-4-5-20251001",
};

// Default models per role
const DEFAULT_MODELS: Record<AgentRole, string> = {
  planner: "opus",
  generator: "opus",
  evaluator: "sonnet",
};

// Default tools per role
const DEFAULT_TOOLS: Record<AgentRole, string[]> = {
  planner: ["Read", "Write"],
  generator: ["Read", "Edit", "Write", "Bash", "Glob", "Grep"],
  evaluator: ["Read", "Bash", "Grep", "Glob"],
};

// Default max turns per role
const DEFAULT_MAX_TURNS: Record<AgentRole, number> = {
  planner: 30,
  generator: 100,
  evaluator: 50,
};

export interface AgentResult {
  response: string;
  costUsd: number;
}

export interface RunAgentOptions {
  role: AgentRole;
  prompt: string;
  onActivity?: (tool: string, summary: string) => void;
}

export interface ModelOverrides {
  planner?: string;
  generator?: string;
  evaluator?: string;
}

export class ContextManager {
  private apiKey: string;
  private projectContext: ProjectContext;
  private modelOverrides: ModelOverrides;

  constructor(apiKey: string, projectContext: ProjectContext, modelOverrides?: ModelOverrides) {
    this.apiKey = apiKey;
    this.projectContext = projectContext;
    this.modelOverrides = modelOverrides ?? {};
  }

  getModelForRole(role: AgentRole): string {
    // Priority: CLI override > config.yaml > default
    const cliModel = this.modelOverrides[role];
    if (cliModel) return MODEL_MAP[cliModel] ?? cliModel;

    const config = this.projectContext.config;
    const configModel = config?.agents?.[role]?.model;
    const shortName = configModel ?? DEFAULT_MODELS[role];
    return MODEL_MAP[shortName] ?? shortName;
  }

  getToolsForRole(role: AgentRole): string[] {
    return DEFAULT_TOOLS[role];
  }

  getMaxTurnsForRole(role: AgentRole): number {
    const config = this.projectContext.config;
    return config?.agents?.[role]?.maxTurns ?? DEFAULT_MAX_TURNS[role];
  }

  async runAgent(options: RunAgentOptions): Promise<AgentResult> {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");

    const { role, prompt, onActivity } = options;

    const appendPrompt =
      this.projectContext.config?.agents?.[role]?.systemPromptAppend;
    const systemPrompt = buildSystemPrompt(
      role,
      this.projectContext,
      appendPrompt,
    );

    const model = this.getModelForRole(role);
    const tools = this.getToolsForRole(role);
    const maxTurns = this.getMaxTurnsForRole(role);

    // SDK query() returns an AsyncGenerator<SDKMessage>
    // We iterate through all messages, collecting activity events and the final result
    const conversation = query({
      prompt,
      options: {
        systemPrompt,
        model,
        tools,
        maxTurns,
        cwd: this.projectContext.root,
        allowedTools: tools,
        permissionMode: "bypassPermissions" as const,
        allowDangerouslySkipPermissions: true,
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: this.apiKey,
        },
      },
    });

    let response = "";
    let costUsd = 0;

    for await (const message of conversation) {
      // Handle assistant messages — extract tool_use blocks for activity events
      if (message.type === "assistant" && onActivity) {
        const assistantMsg = message as {
          type: "assistant";
          message: {
            content: Array<{
              type: string;
              name?: string;
              input?: Record<string, unknown>;
              text?: string;
            }>;
          };
        };
        if (Array.isArray(assistantMsg.message?.content)) {
          for (const block of assistantMsg.message.content) {
            if (block.type === "tool_use" && block.name) {
              onActivity(
                block.name,
                summarizeToolUse({
                  name: block.name,
                  input: block.input ?? {},
                }),
              );
            }
          }
        }
      }

      // Handle result messages — extract final response and cost
      if (message.type === "result") {
        const resultMsg = message as {
          type: "result";
          subtype: string;
          result?: string;
          total_cost_usd: number;
        };
        costUsd = resultMsg.total_cost_usd ?? 0;
        if (resultMsg.subtype === "success" && resultMsg.result) {
          response = resultMsg.result;
        }
      }
    }

    return { response, costUsd };
  }
}

function summarizeToolUse(block: {
  name: string;
  input: Record<string, unknown>;
}): string {
  const name = block.name;
  const input = block.input;
  if (name === "Read" && input.file_path) return `Read ${input.file_path}`;
  if (name === "Write" && input.file_path) return `Write ${input.file_path}`;
  if (name === "Edit" && input.file_path) return `Edit ${input.file_path}`;
  if (name === "Bash" && input.command)
    return `Bash: ${String(input.command).slice(0, 80)}`;
  if (name === "Glob" && input.pattern) return `Glob ${input.pattern}`;
  if (name === "Grep" && input.pattern) return `Grep ${input.pattern}`;
  return name;
}

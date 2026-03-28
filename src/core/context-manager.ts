import type { AgentRole, ProjectContext, HarnessConfig } from "./types.js";
import { buildSystemPrompt } from "../defaults/prompts.js";

// Model mapping
const MODEL_MAP: Record<string, string> = {
  opus: "claude-opus-4-6",
  sonnet: "claude-sonnet-4-5-20250929",
  haiku: "claude-haiku-4-5-20251001",
};

// Default models per role
const DEFAULT_MODELS: Record<AgentRole, string> = {
  planner: "sonnet",
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

export class ContextManager {
  private apiKey: string;
  private projectContext: ProjectContext;

  constructor(apiKey: string, projectContext: ProjectContext) {
    this.apiKey = apiKey;
    this.projectContext = projectContext;
  }

  getModelForRole(role: AgentRole): string {
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
    // Dynamic import to avoid hard dependency
    const { query } = await import("@anthropic-ai/claude-agent-sdk");

    const { role, prompt, onActivity } = options;

    const appendPrompt = this.projectContext.config?.agents?.[role]?.systemPromptAppend;
    const systemPrompt = buildSystemPrompt(role, this.projectContext, appendPrompt);

    const model = this.getModelForRole(role);
    const tools = this.getToolsForRole(role);
    const maxTurns = this.getMaxTurnsForRole(role);

    const result = await query({
      model,
      systemPrompt,
      prompt,
      tools,
      maxTurns,
      apiKey: this.apiKey,
      cwd: this.projectContext.root,
    });

    // Process tool use messages for activity events
    if (onActivity && result.messages) {
      for (const msg of result.messages) {
        if (msg.role === "assistant" && Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === "tool_use") {
              onActivity(block.name, summarizeToolUse(block));
            }
          }
        }
      }
    }

    return {
      response: extractTextResponse(result),
      costUsd: result.usage?.cost_usd ?? 0,
    };
  }
}

function summarizeToolUse(block: { name: string; input: Record<string, unknown> }): string {
  const name = block.name;
  const input = block.input;
  if (name === "Read" && input.file_path) return `Read ${input.file_path}`;
  if (name === "Write" && input.file_path) return `Write ${input.file_path}`;
  if (name === "Edit" && input.file_path) return `Edit ${input.file_path}`;
  if (name === "Bash" && input.command) return `Bash: ${String(input.command).slice(0, 80)}`;
  if (name === "Glob" && input.pattern) return `Glob ${input.pattern}`;
  if (name === "Grep" && input.pattern) return `Grep ${input.pattern}`;
  return name;
}

function extractTextResponse(result: { messages?: Array<{ role: string; content: unknown }> }): string {
  if (!result.messages) return "";
  for (let i = result.messages.length - 1; i >= 0; i--) {
    const msg = result.messages[i];
    if (msg.role === "assistant") {
      if (typeof msg.content === "string") return msg.content;
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if ((block as { type: string }).type === "text") {
            return (block as { type: string; text: string }).text;
          }
        }
      }
    }
  }
  return "";
}

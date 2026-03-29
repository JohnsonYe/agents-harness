// Type declaration for the optional @anthropic-ai/claude-agent-sdk dependency.
// The SDK is dynamically imported at runtime and is not installed during development.

declare module "@anthropic-ai/claude-agent-sdk" {
  interface QueryOptions {
    model: string;
    systemPrompt: string;
    prompt: string;
    tools: string[];
    maxTurns: number;
    apiKey: string;
    cwd: string;
  }

  interface QueryResult {
    messages?: Array<{
      role: string;
      content: unknown;
    }>;
    usage?: {
      cost_usd?: number;
    };
  }

  export function query(opts: QueryOptions): Promise<QueryResult>;
}

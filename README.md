# agent-harness

A multi-agent orchestrator for autonomous software development. Three AI agents — **Planner**, **Generator**, and **Evaluator** — work together in a loop to turn your feature spec into working code.

Built on the architecture described in Anthropic's engineering blog post: [**Harness Design for Long-Running Apps**](https://www.anthropic.com/engineering/harness-design-long-running-apps). The core idea: separate generation from evaluation (like a GAN), reset context between agent invocations to prevent degradation, and use file-based handoffs so each agent starts fresh.

## How It Works

```
You write a spec
     |
     v
 [Planner]  -----> Expands spec, breaks it into sprints, writes contracts
     |
     v
 [Generator] ----> Implements the sprint contract (reads/writes/edits code)
     |
     v
 [Evaluator] ----> Critically tests the implementation against the contract
     |
   PASS? ----yes--> Next sprint (or done)
     |
    no
     |
     v
 [Generator] ----> Tries again with evaluator feedback
     |
     v
   (loop up to max attempts)
```

Each agent gets a **fresh context** on every invocation — no accumulated confusion from long conversations. State is passed between agents via files in the `.harness/` directory, not conversation history.

## Quick Start

### 1. Install

```bash
npm install -g agent-harness
```

### 2. Set your API key

```bash
# Option A: Environment variable
export ANTHROPIC_API_KEY=sk-ant-...

# Option B: Global config
agent-harness config set api-key sk-ant-...
```

### 3. Run

```bash
cd your-project
agent-harness run "Add user authentication with email/password login and JWT tokens"
```

That's it. The harness will plan, implement, and test the feature across multiple sprints.

## Commands

### `run` — Start a new run

```bash
agent-harness run "<spec>"
```

Give it a feature description and it handles the rest.

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `-s, --scope <workspaces...>` | Limit to specific workspaces (monorepo) | All |
| `--max-attempts <n>` | Max retry attempts per sprint | 3 |
| `--max-budget <n>` | Max total spend in USD | 50 |
| `--dashboard` | Open a live web dashboard | Off |
| `--port <n>` | Dashboard port | 3117 |

**Examples:**

```bash
# Simple feature
agent-harness run "Add a /health endpoint that returns 200 OK"

# With budget limit
agent-harness run "Refactor the auth module to use OAuth2" --max-budget 20

# Monorepo — only touch the backend
agent-harness run "Add pagination to the users API" --scope packages/api

# With live dashboard
agent-harness run "Build a notification system" --dashboard
```

### `init` — Initialize project config (optional)

```bash
agent-harness init
```

Creates a `.harness/` directory with:
- `config.yaml` — agent models, budget limits, attempt limits
- `criteria.md` — custom evaluation criteria template

The harness works without `init` — it auto-detects your stack. Only run this if you want to customize settings.

**Example output:**

```
Detected project:
  Repository type: single
  Workspace: .
    Language: typescript
    Framework: next.js
    Test runner: vitest
    Test command: npx vitest run
  CLAUDE.md: found

Created .harness/config.yaml
Created .harness/criteria.md
```

### `status` — Check run progress

```bash
agent-harness status
```

Shows the current state of a run — which sprint you're on, pass/fail status, and cost.

**Example output:**

```
Status: RUNNING
Spec: Add user authentication with email/password login...
Started: 2025-03-28T10:30:00.000Z
Phase: evaluate
Cost: $2.45 / $50.00

Sprints: 2 / 3
  [PASS] Sprint 1 — 1 attempt, $0.85
  [....] Sprint 2 — 2 attempts, $1.60
  [    ] Sprint 3
```

### `resume` — Resume a stopped run

```bash
agent-harness resume
```

Picks up where a stopped or failed run left off. Skips completed sprints.

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `--max-budget <n>` | Max total spend in USD | 50 |
| `--dashboard` | Open a live web dashboard | Off |
| `--port <n>` | Dashboard port | 3117 |

**Example:**

```bash
# Hit Ctrl+C during a run, then later:
agent-harness resume

# Resume with a higher budget
agent-harness resume --max-budget 100
```

### `config` — Manage global settings

```bash
agent-harness config set <key> <value>
agent-harness config get <key>
```

**Examples:**

```bash
# Save your API key globally
agent-harness config set api-key sk-ant-api03-...

# Check what's set
agent-harness config get api-key
```

Config is stored at `~/.agent-harness/config.yaml`.

## Configuration

### Zero-config (default)

The harness auto-detects your project:
- **Language** — TypeScript, Python, Rust, Go
- **Framework** — Next.js, Django, etc.
- **Test runner** — vitest, jest, pytest, cargo test, go test
- **Repo type** — single repo or monorepo (npm workspaces, pnpm, lerna)
- **CLAUDE.md** — reads project conventions if present

### Custom config (optional)

Run `agent-harness init`, then edit `.harness/config.yaml`:

```yaml
agents:
  planner:
    model: sonnet
  generator:
    model: opus
    maxTurns: 100
  evaluator:
    model: sonnet
max_attempts_per_sprint: 3
max_budget_per_sprint_usd: 5
max_total_budget_usd: 50
```

**Available models:** `opus`, `sonnet`, `haiku`

### Custom evaluation criteria

Edit `.harness/criteria.md` to add project-specific rules:

```markdown
# Custom Evaluation Criteria

- All API endpoints must return proper HTTP status codes
- Database migrations must be reversible
- All user-facing strings must be internationalized
```

These are checked **in addition to** the built-in defaults (correctness, testing, code quality, integration).

## Live Dashboard

Enable with `--dashboard` to get a real-time web UI:

```bash
agent-harness run "Build a feature" --dashboard
# Dashboard: http://localhost:3117
```

The dashboard shows:
- Sprint progress with pass/fail status
- Live activity stream (every file read, edit, bash command)
- Evaluation results with passed/failed criteria
- Cost tracking with budget progress bar
- Auto-reconnects if the connection drops

## Programmatic API

Use agent-harness as a library in your own tools:

```typescript
import { Harness } from "agent-harness";

const harness = new Harness({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  root: "/path/to/project",
  maxTotalBudgetUsd: 20,
});

harness.on("phase:start", (data) => {
  console.log(`Phase: ${data.phase}, Sprint: ${data.sprint}`);
});

harness.on("evaluation", (data) => {
  console.log(`Sprint ${data.sprint}: ${data.result.passed ? "PASS" : "FAIL"}`);
});

harness.on("run:complete", (data) => {
  console.log(`Done — ${data.status}, cost: $${data.totalCostUsd.toFixed(2)}`);
});

await harness.run("Add a REST API for managing todos");
```

### Exported classes and functions

| Export | Description |
|--------|-------------|
| `Harness` | Main orchestrator class |
| `ContextManager` | Wraps Agent SDK with fresh context per call |
| `FileProtocol` | Manages `.harness/` directory state |
| `DashboardServer` | HTTP + WebSocket dashboard server |
| `buildProjectContext` | Auto-detect project stack and config |
| `detectStack` | Detect language, framework, test runner |
| `buildSystemPrompt` | Build agent system prompts |
| `DEFAULT_CRITERIA` | Built-in evaluation criteria |

## The Three Agents

| Agent | Model | Role | Tools |
|-------|-------|------|-------|
| **Planner** | Sonnet | Writes specs, decomposes into sprints, writes contracts | Read, Write |
| **Generator** | Opus | Implements code based on the contract | Read, Edit, Write, Bash, Glob, Grep |
| **Evaluator** | Sonnet | Critically tests implementation against contract | Read, Bash, Grep, Glob |

Key design principle from the Anthropic article: **the generator never evaluates its own work**. A separate evaluator with fresh context provides unbiased assessment.

## Requirements

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com/)
- The `@anthropic-ai/claude-agent-sdk` package (peer dependency)

## Credits

This project is built on the harness architecture described in Anthropic's engineering article: [**Harness Design for Long-Running Apps**](https://www.anthropic.com/engineering/harness-design-long-running-apps). The article introduces the pattern of separating generation from evaluation, using fresh context windows per agent invocation, and file-based state handoffs to enable reliable multi-hour autonomous coding sessions.

## License

ISC

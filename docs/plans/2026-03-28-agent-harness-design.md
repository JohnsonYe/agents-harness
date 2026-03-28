# Agent Harness — v1 Design Document

**Date**: 2026-03-28
**Package**: `agent-harness` (npm)
**License**: Open source
**Engine**: Claude Agent SDK (TypeScript)

## Overview

Agent Harness is an open-source npm package that orchestrates a multi-agent loop for building complex software features autonomously. Inspired by Anthropic's harness design for long-running applications, it separates code generation from code evaluation using a GAN-inspired architecture: a Generator agent writes code while an independent Evaluator agent critically tests it, looping until quality criteria are met.

The core insight: models are bad at evaluating their own work. Separating generation from evaluation, each with fresh context windows and file-based state transfer, produces dramatically higher quality output than single-agent approaches.

## Architecture

```
agent-harness (npm package)
│
├── CLI Commands
│   ├── agent-harness run "spec"       # Full harness execution + dashboard
│   ├── agent-harness init             # Scaffold project config (optional)
│   ├── agent-harness status           # Check run progress
│   ├── agent-harness resume           # Continue stopped run
│   └── agent-harness config set ...   # User-level settings
│
├── Core
│   ├── Orchestrator (the loop)
│   ├── File protocol (.harness/)
│   ├── Context manager (fresh query per phase)
│   └── Progress tracking + resume
│
├── Agents (Agent SDK query() calls)
│   ├── Planner (spec + decompose + contract)
│   ├── Generator (implement code)
│   └── Evaluator (test + critique)
│
├── Discovery
│   ├── Stack detection (single + monorepo)
│   ├── CLAUDE.md reading
│   └── Config loading
│
├── Dashboard
│   ├── Localhost web UI (auto-starts with run)
│   ├── WebSocket live updates
│   └── Full transparency (agent activity, critiques)
│
└── Public API
    ├── Harness class (programmatic use)
    └── Event emitters (sprint, evaluation, complete)
```

## Package Structure

```
agent-harness/
├── src/
│   ├── index.ts                # Public API (for programmatic use)
│   ├── cli.ts                  # CLI entry point
│   │
│   ├── core/
│   │   ├── orchestrator.ts     # The loop — sprint execution
│   │   ├── file-protocol.ts    # .harness/ file management
│   │   └── context-manager.ts  # Fresh query() per phase
│   │
│   ├── agents/
│   │   ├── types.ts            # AgentRole interface
│   │   ├── planner.ts          # Default planner prompt + config
│   │   ├── generator.ts        # Default generator prompt + config
│   │   └── evaluator.ts        # Default evaluator prompt + config
│   │
│   ├── discovery/
│   │   ├── project-context.ts  # Reads CLAUDE.md, detects stack
│   │   └── config-loader.ts    # Loads .harness/config.yaml if exists
│   │
│   ├── dashboard/
│   │   ├── server.ts           # HTTP server (node:http, no framework)
│   │   ├── socket.ts           # WebSocket for live updates (ws package)
│   │   └── static/
│   │       └── index.html      # Single HTML file, inline CSS + vanilla JS
│   │
│   └── defaults/
│       ├── criteria.ts         # Built-in evaluation criteria
│       └── prompts.ts          # Base system prompts per role
│
├── package.json
├── tsconfig.json
└── README.md
```

## Core Design Principles

### 1. Zero Config by Default

The harness works the moment you install it. No `.harness/` directory needed, no config files, no init command. It auto-detects the project stack, reads CLAUDE.md if present, and uses sensible defaults for everything.

`harness init` is optional — for teams that want to customize models, evaluation criteria, or agent behavior.

### 2. State Lives in Files, Not Context

Every agent invocation gets a fresh context window via a new `query()` call. There is no context accumulation, no compression, no degradation over time. The model at hour 4 is exactly as sharp as at hour 0.

State transfers between agents through files in `.harness/`. This is the communication bus — one agent writes, another reads.

### 3. Role Separation (GAN-Inspired)

The Generator never evaluates its own work. The Evaluator never writes code. This separation is enforced at the system prompt level. The article's core finding: tuning a standalone evaluator for skepticism is far more tractable than making a generator critical of its own work.

### 4. Modularity

Every component encodes an assumption about what the model can't do on its own. As models improve, components should be removable. The config supports skipping phases, and the module interfaces are designed for future swappability (v2).

### 5. Don't Touch the User's Project (Unless Asked)

The harness writes code to the project (that's its job) but does NOT create configuration files without explicit `harness init`. Ephemeral `.harness/` files are auto-created during runs and gitignored. The user's project structure is never modified for harness infrastructure.

## Orchestration Loop

```
harness run "Build a notification system"
│
├── 1. DISCOVER
│   Read CLAUDE.md, detect stack, load config.yaml if exists
│   Result: ProjectContext object (passed to all agents)
│
├── 2. PLAN (fresh context)
│   Planner agent
│   Input: user spec + ProjectContext
│   Output: .harness/spec.md
│
├── 3. DECOMPOSE (fresh context)
│   Planner agent
│   Input: spec.md
│   Output: .harness/sprints.md (ordered list of sprints)
│
├── 4. FOR EACH SPRINT
│   │
│   ├── 4a. CONTRACT (fresh context)
│   │   Planner reads sprint N from sprints.md
│   │   Writes .harness/contract.md
│   │   (what to build + testable success criteria)
│   │
│   ├── 4b. GENERATE (fresh context)
│   │   Generator reads contract.md + evaluation.md (if retry)
│   │   Writes actual code to the project
│   │   Runs tests before finishing
│   │
│   ├── 4c. EVALUATE (fresh context)
│   │   Evaluator reads contract.md
│   │   Runs tests, inspects code, checks criteria
│   │   Writes .harness/evaluation.md (PASS/FAIL + critique)
│   │
│   ├── 4d. DECISION (orchestrator code, no LLM)
│   │   if PASS → write handoff, move to next sprint
│   │   if FAIL and attempts < max → back to 4b
│   │   if FAIL and attempts >= max → stop, report to user
│   │
│   └── 4e. HANDOFF (fresh context)
│       Generator writes .harness/handoff.md
│       (what was built, decisions made, state for next sprint)
│
└── 5. COMPLETE
    Final summary written to .harness/summary.md
    CLI outputs result to terminal
```

Step 4d is pure code — an `if` statement, not an LLM call. The orchestrator never asks the model "should we continue?" The pass/fail decision comes from parsing the evaluator's structured output.

On retries (step 4b), the generator gets a fresh context. It knows what went wrong by reading `evaluation.md` and can see the current code on disk. It does NOT have its previous reasoning — this is by design. Fresh eyes on each attempt, as recommended by the article.

## Agent Definitions

### Planner

**Role**: Convert user descriptions into specs, break specs into sprints, write contracts.

**System prompt core directives**:
- Focus on WHAT to build, not HOW to implement
- Be ambitious in scope
- Define user-facing behavior, not internal architecture
- Each milestone must be independently testable
- Never write code or suggest implementations

**Model**: Sonnet (default) — planning doesn't need the most powerful model
**Tools**: Read, Write
**Max turns**: 20

### Generator

**Role**: Implement features based on sprint contracts.

**System prompt core directives**:
- Read contract.md for what to build
- Read evaluation.md for previous feedback (if retry)
- Implement EXACTLY what the contract specifies — no more, no less
- Follow project conventions from CLAUDE.md
- Run tests before finishing
- Commit work with conventional commits
- Do NOT evaluate your own work

**Model**: Opus (default) — code generation benefits from the strongest model
**Tools**: Read, Edit, Write, Bash, Glob, Grep
**Max turns**: 50

### Evaluator

**Role**: Critically test implementations against contracts.

**System prompt core directives**:
- Be skeptical — assume things are broken until proven otherwise
- Never give the benefit of the doubt
- A feature that "should work" but wasn't tested does NOT pass
- Stubbed or placeholder implementations are automatic failures
- Run the test suite, check each criterion, write structured PASS/FAIL

**Evaluation output format**:
```
Status: PASS | FAIL
Failed criteria: [list]
Critique: [specific, actionable feedback per failure]
What worked: [brief acknowledgment]
```

**Model**: Sonnet (default) — evaluation is mostly reading and testing
**Tools**: Read, Bash, Grep, Glob
**Max turns**: 30

### Agent Customization (v1)

Users customize agents via `config.yaml` — prompts + config only, no custom modules:

```yaml
agents:
  planner:
    model: sonnet
    max_turns: 20
    system_prompt_append: "Focus on microservices architecture"
  generator:
    model: opus
    max_turns: 50
  evaluator:
    model: sonnet
    max_turns: 30
    system_prompt_append: |
      Additional rules:
      - All API endpoints must return proper error responses
      - Frontend components must be accessible (WCAG 2.1 AA)
```

Users append to prompts but cannot replace them. Role separation and behavioral rules are always enforced.

## Discovery System

Runs before any agent. Builds a `ProjectContext` object injected into every agent's system prompt.

### ProjectContext Interface

```typescript
interface ProjectContext {
  repoType: "single" | "monorepo";
  workspaces: Workspace[];
  rootClaudeMd: string | null;
  config: HarnessConfig | null;
  criteria: string | null;
  scope: string[] | null;       // From --scope flag
  root: string;
}

interface Workspace {
  root: string;                 // "frontend", "backend", "." for single repo
  stack: Stack;
  claudeMd: string | null;     // Workspace-specific CLAUDE.md
}

interface Stack {
  language: string;
  framework: string | null;
  testRunner: string | null;
  testCommand: string;
  lintCommand: string | null;
  buildCommand: string | null;
  devServer: string | null;
}
```

### Stack Detection

Pure file existence checks, no LLM. Runs in milliseconds.

**Language detection**:
- `package.json` → TypeScript/JavaScript
- `requirements.txt` / `pyproject.toml` → Python
- `Cargo.toml` → Rust
- `go.mod` → Go

**Framework detection**:
- `next.config.*` → Next.js
- `vite.config.*` → Vite
- `manage.py` → Django
- `src/main.rs` → Rust binary

**Test runner detection**:
- `jest.config.*` → Jest
- `vitest.config.*` → Vitest
- `pytest.ini` / `pyproject.toml[pytest]` → Pytest
- `Cargo.toml` → cargo test

**Monorepo detection**:
- `package.json` with `workspaces` field → npm/yarn monorepo
- `pnpm-workspace.yaml` → pnpm monorepo
- `lerna.json` → Lerna monorepo
- Multiple directories with independent stack markers → convention-based monorepo

### Config Override

Config always wins over auto-detection:

```yaml
workspaces:
  frontend:
    path: frontend/
    language: typescript
    framework: nextjs
    test_command: "npm test --prefix frontend"
  backend:
    path: backend/
    language: python
    test_command: "cd backend && pytest"
```

## File Protocol

### Directory Structure

```
.harness/                       # Auto-created on first run
├── spec.md                     # Planner writes, all agents read
├── sprints.md                  # Planner writes, orchestrator reads
├── contract.md                 # Planner writes, generator + evaluator read
├── evaluation.md               # Evaluator writes, generator reads on retry
├── handoff.md                  # Generator writes, next sprint reads
├── progress.md                 # Orchestrator writes (machine-readable state)
└── summary.md                  # Orchestrator writes on completion
```

### Ownership Rules

| File | Writer | Reader | When |
|------|--------|--------|------|
| `spec.md` | Planner | Generator, Evaluator | Once, at start |
| `sprints.md` | Planner | Orchestrator | Once, after spec |
| `contract.md` | Planner | Generator, Evaluator | Once per sprint |
| `evaluation.md` | Evaluator | Generator | After each evaluation |
| `handoff.md` | Generator | Next sprint's agents | End of each sprint |
| `progress.md` | Orchestrator (code) | CLI status/resume | Continuously |
| `summary.md` | Orchestrator (code) | User | On completion |

### Gitignore Management

On first run, the harness adds ephemeral files to `.gitignore`:

```gitignore
# agent-harness (ephemeral files)
.harness/spec.md
.harness/sprints.md
.harness/contract.md
.harness/evaluation.md
.harness/handoff.md
.harness/progress.md
.harness/summary.md
```

Files created by `harness init` (`config.yaml`, `criteria.md`) are NOT gitignored — they're project knowledge.

### Cleanup

On successful completion, ephemeral files (contract, evaluation, handoff) are cleared. `spec.md`, `progress.md`, and `summary.md` remain for reference.

## The `harness init` Command

Optional. Scaffolds project-specific configuration.

**What it creates**:

```
.harness/
├── config.yaml     ← Pre-filled from auto-detection
└── criteria.md     ← Template with common criteria
```

**config.yaml** is pre-filled with detected values so users edit rather than write from scratch.

**criteria.md** is a markdown template:

```markdown
# Evaluation Criteria

## Code Quality
- All functions must have error handling for edge cases
- No TODO or FIXME comments left in final code

## Testing
- New features must have unit tests
- API endpoints must have integration tests

## Project-Specific
- (Add your team's standards here)
```

## Dashboard

A lightweight localhost web UI that provides real-time visibility into harness runs.

### Startup

```bash
$ agent-harness run "Build notification system"

Harness running → http://localhost:4820
Sprint 1 of 4 | Attempt 1 | $0.00
```

Auto-starts with every run. Disable with `--no-dashboard`. Custom port with `--port`.

### Features

- **Sprint progress**: Visual status of each sprint (pending, running, passed, failed)
- **Attempt tracking**: How many attempts per sprint, pass/fail history
- **Evaluator critiques**: Expandable sections showing exactly what failed and why
- **Live agent activity**: Real-time stream of tool calls (file reads, edits, bash commands)
- **Budget tracking**: Visual progress bar of cost vs budget
- **Duration**: Running time per sprint and total

### Implementation

No framework. Single HTML file with inline CSS and vanilla JavaScript. WebSocket for live updates.

```
src/dashboard/
├── server.ts          # node:http, ~50 lines
├── socket.ts          # ws package, ~30 lines
└── static/
    └── index.html     # Single file, ~400 lines
```

### Data Flow

The orchestrator emits events it already tracks. The dashboard server listens and forwards to WebSocket clients:

```typescript
orchestrator.on("phase:start", (data) => broadcast(data));
orchestrator.on("agent:activity", (data) => broadcast(data));
orchestrator.on("evaluation", (data) => broadcast(data));
orchestrator.on("cost:update", (data) => broadcast(data));
```

## Resume and Recovery

### Progress Tracking

`progress.md` contains machine-readable state:

```yaml
status: running | stopped | completed | failed
run_spec: "Build notification system"
current_sprint: 2
total_sprints: 4
current_attempt: 3
current_phase: evaluate
started_at: 2026-03-28T10:00:00Z
cost_usd: 45.20
max_budget_usd: 150.00
sprints:
  1: { status: passed, attempts: 2, cost_usd: 12.40 }
  2: { status: in_progress, attempts: 3, cost_usd: 18.60 }
  3: { status: pending }
  4: { status: pending }
```

### Graceful Shutdown

On ctrl+c: wait for current agent phase to finish, save progress, exit cleanly.

### Resume

`agent-harness resume` reads `progress.md` and jumps to the correct sprint/phase/attempt. The orchestrator loop is re-entrant — it can start from any point.

Resume works even after manual code edits because each agent gets a fresh context and reads the actual filesystem, not cached state.

## Authentication

### API Key Priority (highest to lowest)

1. CLI flag: `--api-key sk-ant-...`
2. Environment variable: `ANTHROPIC_API_KEY`
3. `.env` file in project root
4. Global config: `~/.agent-harness/config.yaml`

### Global Config

```yaml
# ~/.agent-harness/config.yaml
api_key: sk-ant-...
default_model: opus
max_budget_usd: 100.00
```

Set via: `agent-harness config set api-key sk-ant-...`

API keys are never stored in the project. Each team member uses their own key.

## Public API

```typescript
import { Harness } from "agent-harness";

const harness = new Harness({
  projectRoot: "/path/to/project",
  apiKey: process.env.ANTHROPIC_API_KEY,
  models: { generator: "opus", evaluator: "sonnet" },
  maxBudgetUsd: 100,
});

harness.on("sprint:start", (sprint) => { ... });
harness.on("evaluation", (result) => { ... });
harness.on("agent:activity", (entry) => { ... });
harness.on("complete", (summary) => { ... });

await harness.run("Build a notification system");
await harness.resume();
```

## CLI Reference

```bash
# Run the harness
agent-harness run "spec" [options]
  --model <model>           # Default model for all agents
  --max-budget <usd>        # Total budget limit
  --scope <workspaces>      # Comma-separated workspace filter (monorepo)
  --no-dashboard            # Disable web UI
  --port <number>           # Dashboard port (default: 4820)
  --api-key <key>           # API key override

# Initialize project config (optional)
agent-harness init

# Check run status
agent-harness status

# Resume a stopped run
agent-harness resume

# User-level settings
agent-harness config set <key> <value>
agent-harness config get <key>
```

## What's NOT in v1

- Claude Code skill integration (`/harness` command)
- Claude Code Task tool as execution engine
- Custom TypeScript agent modules
- Playwright-based evaluator
- Multi-provider support (only Claude)
- Custom module registry / plugin system

## Future Considerations (v2+)

- **Claude Code integration**: `/harness` skill that invokes the harness from within Claude Code, potentially using Claude Code's Task tool to leverage Max subscriptions
- **Custom modules**: Users write TypeScript modules implementing agent interfaces, loaded from `.harness/modules/`
- **Playwright evaluator**: Browser-based testing for frontend features
- **Module registry**: Shared modules via npm (`harness-module-security-evaluator`)
- **Multi-provider**: Support for other LLM providers as agents

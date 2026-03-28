# Agent Harness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `agent-harness`, an open-source npm package that orchestrates a planner-generator-evaluator loop using the Claude Agent SDK for autonomous software development.

**Architecture:** Three-agent system with fresh context per invocation, file-based state transfer, and a localhost dashboard for live monitoring. The orchestrator is pure TypeScript control flow — no LLM in the loop logic.

**Tech Stack:** TypeScript, `@anthropic-ai/claude-agent-sdk`, `ws` (WebSocket), `yaml` (config parsing), `commander` (CLI), `vitest` (testing)

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/index.ts`
- Create: `src/cli.ts`
- Create: `.gitignore`

**Step 1: Initialize git and npm**

```bash
cd /Users/johnson/Desktop/workplace/harness
git init
npm init -y
```

**Step 2: Install dependencies**

```bash
npm install @anthropic-ai/claude-agent-sdk commander ws yaml dotenv
npm install -D typescript @types/node @types/ws vitest
```

**Step 3: Create tsconfig.json**

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "declarationDir": "dist",
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

**Step 4: Create vitest.config.ts**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    globals: false,
    environment: "node",
  },
});
```

**Step 5: Update package.json**

Set these fields:
```json
{
  "name": "agent-harness",
  "version": "0.1.0",
  "description": "Multi-agent orchestrator for autonomous software development",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": { "agent-harness": "dist/cli.js" },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "type": "module"
}
```

**Step 6: Create directory structure**

```bash
mkdir -p src/{core,agents,discovery,dashboard/static,defaults,commands}
mkdir -p tests/{core,agents,discovery,dashboard,integration}
```

**Step 7: Create placeholder entry files**

Create `src/index.ts`:
```typescript
// Public API — exports added as modules are built
export {};
```

Create `src/cli.ts`:
```typescript
#!/usr/bin/env node
console.log("agent-harness CLI — not yet implemented");
```

**Step 8: Create .gitignore**

```
node_modules/
dist/
.env
*.tgz
```

**Step 9: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts src/ tests/ .gitignore
git commit -m "feat: scaffold agent-harness project"
```

---

## Task 2: Core Types

**Files:**
- Create: `src/core/types.ts`
- Test: `tests/core/types.test.ts`

**Step 1: Write type validation tests**

Create `tests/core/types.test.ts` — tests that construct all core types and verify they satisfy their interfaces. Cover `ProjectContext`, `Progress`, `EvalResult`, `HarnessConfig`, and all event types.

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/types.test.ts`
Expected: FAIL — module not found

**Step 3: Implement types**

Create `src/core/types.ts` with all shared type definitions:
- `Stack`, `Workspace`, `ProjectContext` — discovery types
- `AgentConfig`, `WorkspaceConfig`, `HarnessConfig` — config types
- `SprintStatus`, `RunStatus`, `Phase`, `SprintProgress`, `Progress` — orchestration types
- `EvalResult` — evaluation parsing type
- `AgentRole`, `AgentDefinition` — agent types
- All event types: `PhaseStartEvent`, `AgentActivityEvent`, `EvaluationEvent`, `CostUpdateEvent`, `SprintCompleteEvent`, `RunCompleteEvent`, `HarnessEvent`

**Step 4: Run tests**

Run: `npx vitest run tests/core/types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/types.ts tests/core/types.test.ts
git commit -m "feat: add core type definitions"
```

---

## Task 3: Stack Detection

**Files:**
- Create: `src/discovery/stack-detector.ts`
- Test: `tests/discovery/stack-detector.test.ts`

**Step 1: Write failing tests**

Create `tests/discovery/stack-detector.test.ts` with test cases:
- Detects TypeScript + Next.js project
- Detects Python + Django project
- Detects Rust project
- Detects Go project
- Returns "unknown" for empty directory
- Detects npm workspaces monorepo
- Detects pnpm monorepo
- Detects single repo
- Returns single workspace for single repo
- Returns multiple workspaces for monorepo

Each test scaffolds a temp directory with the right files (package.json, requirements.txt, etc.) and calls `detectStack()`, `detectRepoType()`, or `discoverWorkspaces()`.

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/discovery/stack-detector.test.ts`
Expected: FAIL

**Step 3: Implement stack-detector.ts**

Create `src/discovery/stack-detector.ts` with:
- `detectStack(root)` — file existence checks for language, framework, test runner, commands
- `detectRepoType(root)` — checks workspaces field, pnpm-workspace.yaml, lerna.json, multi-directory conventions
- `discoverWorkspaces(root)` — returns Workspace[] based on repo type
- Helper: `readClaudeMd(dir)` — reads .claude/CLAUDE.md or CLAUDE.md

**Step 4: Run tests**

Run: `npx vitest run tests/discovery/stack-detector.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/discovery/stack-detector.ts tests/discovery/stack-detector.test.ts
git commit -m "feat: add stack detection and workspace discovery"
```

---

## Task 4: Config Loader

**Files:**
- Create: `src/discovery/config-loader.ts`
- Test: `tests/discovery/config-loader.test.ts`

**Step 1: Write failing tests**

Create `tests/discovery/config-loader.test.ts`:
- Returns null when no config exists
- Loads and parses config.yaml with snake_case to camelCase conversion
- Returns null when no criteria file exists
- Loads criteria.md content

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/discovery/config-loader.test.ts`
Expected: FAIL

**Step 3: Implement config-loader.ts**

Create `src/discovery/config-loader.ts`:
- `loadConfig(root)` — reads `.harness/config.yaml`, parses YAML, normalizes snake_case keys to camelCase
- `loadCriteria(root)` — reads `.harness/criteria.md`, returns string or null

**Step 4: Run tests**

Run: `npx vitest run tests/discovery/config-loader.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/discovery/config-loader.ts tests/discovery/config-loader.test.ts
git commit -m "feat: add config and criteria loader"
```

---

## Task 5: Project Context Builder

**Files:**
- Create: `src/discovery/project-context.ts`
- Test: `tests/discovery/project-context.test.ts`

**Step 1: Write failing tests**

Create `tests/discovery/project-context.test.ts`:
- Builds context for a simple TypeScript project
- Builds context for a monorepo
- Merges config overrides into context
- Applies scope filter
- Reads root CLAUDE.md

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/discovery/project-context.test.ts`
Expected: FAIL

**Step 3: Implement project-context.ts**

Create `src/discovery/project-context.ts`:
- `buildProjectContext(root, scope)` — composes stack detection + config loading + CLAUDE.md reading into a single `ProjectContext`

**Step 4: Run tests**

Run: `npx vitest run tests/discovery/project-context.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/discovery/project-context.ts tests/discovery/project-context.test.ts
git commit -m "feat: add project context builder"
```

---

## Task 6: File Protocol

**Files:**
- Create: `src/core/file-protocol.ts`
- Test: `tests/core/file-protocol.test.ts`

**Step 1: Write failing tests**

Create `tests/core/file-protocol.test.ts`:
- Creates .harness directory on init
- Writes and reads progress (YAML serialization round-trip)
- Reads harness files by name
- Returns null for missing files
- Parses PASS evaluation result
- Parses FAIL evaluation result with criteria lists
- Updates .gitignore with harness entries
- Does not duplicate gitignore entries on repeated calls
- Cleans ephemeral files on completion (keeps spec.md, summary.md, progress.md)

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/file-protocol.test.ts`
Expected: FAIL

**Step 3: Implement file-protocol.ts**

Create `src/core/file-protocol.ts`:
- `FileProtocol` class with methods: `ensureDir()`, `writeFile()`, `readFile()`, `writeProgress()`, `readProgress()`, `parseEvaluation()`, `ensureGitignore()`, `cleanEphemeral()`
- Evaluation parsing extracts Status, Failed/Passed criteria lists, and Critique sections

**Step 4: Run tests**

Run: `npx vitest run tests/core/file-protocol.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/file-protocol.ts tests/core/file-protocol.test.ts
git commit -m "feat: add file protocol for harness state management"
```

---

## Task 7: Default Criteria

**Files:**
- Create: `src/defaults/criteria.ts`
- Test: `tests/defaults/criteria.test.ts`

**Step 1: Write failing test**

Create `tests/defaults/criteria.test.ts`:
- DEFAULT_CRITERIA contains base quality criteria (correctness, testing, code quality, integration)
- DEFAULT_CRITERIA is a non-empty string

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/defaults/criteria.test.ts`
Expected: FAIL

**Step 3: Implement criteria.ts**

Create `src/defaults/criteria.ts` exporting `DEFAULT_CRITERIA` string with sections for Correctness, Testing, Code Quality, and Integration.

**Step 4: Run test**

Run: `npx vitest run tests/defaults/criteria.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/defaults/criteria.ts tests/defaults/criteria.test.ts
git commit -m "feat: add default evaluation criteria"
```

---

## Task 8: Default Prompts

**Files:**
- Create: `src/defaults/prompts.ts`
- Test: `tests/defaults/prompts.test.ts`

**Step 1: Write failing tests**

Create `tests/defaults/prompts.test.ts`:
- Builds planner prompt with project context injected
- Builds generator prompt with "Do NOT evaluate your own work" directive
- Builds evaluator prompt with "skeptical" and PASS/FAIL format
- Includes CLAUDE.md content when present
- Includes custom criteria for evaluator
- Appends user prompt additions

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/defaults/prompts.test.ts`
Expected: FAIL

**Step 3: Implement prompts.ts**

Create `src/defaults/prompts.ts`:
- `buildSystemPrompt(role, ctx, appendPrompt?)` — constructs system prompt from base role prompt + project context + criteria + user append
- Base prompts for planner (WHAT not HOW, never write code), generator (implement contract, don't self-evaluate), evaluator (be skeptical, structured PASS/FAIL output)
- `formatProjectContext(ctx)` helper — formats workspaces, stack, CLAUDE.md into readable string

**Step 4: Run tests**

Run: `npx vitest run tests/defaults/prompts.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/defaults/prompts.ts tests/defaults/prompts.test.ts
git commit -m "feat: add default agent system prompts"
```

---

## Task 9: Context Manager

**Files:**
- Create: `src/core/context-manager.ts`
- Test: `tests/core/context-manager.test.ts`

**Step 1: Write failing tests (with mocked Agent SDK)**

Create `tests/core/context-manager.test.ts`:
- Mock `@anthropic-ai/claude-agent-sdk` query function
- Constructs with API key and project context
- Runs agent and returns result with cost
- Collects activity events via callback (from tool_use blocks)
- Resolves correct tools per role (planner=Read,Write; generator=Read,Edit,Write,Bash,Glob,Grep; evaluator=Read,Bash,Grep,Glob)
- Resolves correct default model per role (planner=sonnet, generator=opus, evaluator=sonnet)
- Uses config overrides for model

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/context-manager.test.ts`
Expected: FAIL

**Step 3: Implement context-manager.ts**

Create `src/core/context-manager.ts`:
- `ContextManager` class with `runAgent({ role, prompt, onActivity })` method
- Each `runAgent` call is a fresh `query()` — the core context reset mechanism
- Maps short model names (opus, sonnet, haiku) to full model IDs
- `summarizeToolUse()` helper — converts tool_use blocks to human-readable strings
- `getModelForRole()`, `getToolsForRole()`, `getMaxTurnsForRole()` — apply defaults + config overrides

**Step 4: Run tests**

Run: `npx vitest run tests/core/context-manager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/context-manager.ts tests/core/context-manager.test.ts
git commit -m "feat: add context manager wrapping Agent SDK"
```

---

## Task 10: Orchestrator Core Loop

**Files:**
- Create: `src/core/orchestrator.ts`
- Test: `tests/core/orchestrator.test.ts`

**Step 1: Write failing tests (with mocked dependencies)**

Create `tests/core/orchestrator.test.ts`:
- Mock context-manager, file-protocol, and project-context
- Harness constructs with required options
- Emits phase:start events during run
- Emits run:complete event when done
- Calls planner for spec, decompose, and contract phases
- Calls generator for implementation
- Calls evaluator for testing
- Loops on evaluation failure (mock first eval as FAIL, second as PASS)
- Stops on budget limit
- stop() method sets progress to stopped

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/orchestrator.test.ts`
Expected: FAIL

**Step 3: Implement orchestrator.ts**

Create `src/core/orchestrator.ts`:
- `Harness` class extending `EventEmitter`
- `run(spec)` — full lifecycle: discover → plan → decompose → sprints → complete
- `resume()` — reads progress.md and resumes from correct sprint/phase/attempt
- `stop()` — sets aborted flag, saves progress
- `executeSprint()` — contract → generate → evaluate → decision → handoff loop
- Sprint count parsing from sprints.md content
- Budget checking after each evaluation
- Event emission at each phase transition

**Step 4: Run tests**

Run: `npx vitest run tests/core/orchestrator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/orchestrator.ts tests/core/orchestrator.test.ts
git commit -m "feat: add orchestrator with sprint execution loop"
```

---

## Task 11: CLI — Config Command

**Files:**
- Create: `src/commands/config.ts`
- Test: `tests/commands/config.test.ts`

**Step 1: Write failing tests**

Create `tests/commands/config.test.ts`:
- `resolveApiKey()` returns env var when set
- `resolveApiKey()` returns global config value when no env var
- `resolveApiKey()` returns undefined when nothing configured
- `loadGlobalConfig()` returns empty object when no file exists
- `saveGlobalConfig()` creates the config file

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/commands/config.test.ts`
Expected: FAIL

**Step 3: Implement config.ts**

Create `src/commands/config.ts`:
- `resolveApiKey()` — checks env var, .env, global config in priority order
- `loadGlobalConfig()` / `saveGlobalConfig()` — YAML read/write to `~/.agent-harness/config.yaml`
- `configCommand(action, key, value)` — handles `get` and `set` with key name mapping (api-key → api_key)

**Step 4: Run tests**

Run: `npx vitest run tests/commands/config.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/commands/config.ts tests/commands/config.test.ts
git commit -m "feat: add config command and API key resolution"
```

---

## Task 12: CLI — Run Command

**Files:**
- Create: `src/commands/run.ts`

**Step 1: Implement run.ts**

Create `src/commands/run.ts`:
- `runCommand(spec, options)` — resolves API key, creates Harness, attaches event listeners for terminal output, handles SIGINT for graceful shutdown
- Terminal output: phase transitions, evaluation pass/fail with criteria, sprint summaries, cost tracking, duration
- `formatDuration(ms)` helper

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/commands/run.ts
git commit -m "feat: add run command"
```

---

## Task 13: CLI — Init Command

**Files:**
- Create: `src/commands/init.ts`

**Step 1: Implement init.ts**

Create `src/commands/init.ts`:
- `initCommand()` — runs project discovery, scaffolds `.harness/config.yaml` pre-filled with detected values, creates `criteria.md` template
- Prints detected project info to terminal
- Skips if config.yaml already exists

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/commands/init.ts
git commit -m "feat: add init command"
```

---

## Task 14: CLI — Status and Resume Commands

**Files:**
- Create: `src/commands/status.ts`
- Create: `src/commands/resume.ts`

**Step 1: Implement status.ts**

Create `src/commands/status.ts`:
- `statusCommand()` — reads progress.md via FileProtocol, prints run status, sprint progress with icons, cost summary

**Step 2: Implement resume.ts**

Create `src/commands/resume.ts`:
- `resumeCommand(options)` — resolves API key, creates Harness, calls `harness.resume()`, attaches same event listeners as run command

**Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/commands/status.ts src/commands/resume.ts
git commit -m "feat: add status and resume commands"
```

---

## Task 15: CLI Entry Point

**Files:**
- Modify: `src/cli.ts`

**Step 1: Implement cli.ts with commander**

Rewrite `src/cli.ts`:
- Define `agent-harness` program with commander
- Register all commands: `run`, `init`, `status`, `resume`, `config`
- Each command with correct arguments, options, and action handlers

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Test help output**

Run: `npx tsx src/cli.ts --help`
Expected: Shows all commands

**Step 4: Commit**

```bash
git add src/cli.ts
git commit -m "feat: wire up CLI entry point with all commands"
```

---

## Task 16: Dashboard Server

**Files:**
- Create: `src/dashboard/server.ts`
- Create: `src/dashboard/socket.ts`
- Test: `tests/dashboard/server.test.ts`

**Step 1: Write failing tests**

Create `tests/dashboard/server.test.ts`:
- Starts and stops on a given port
- Returns URL
- Broadcasts events without throwing (even with no connected clients)

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/dashboard/server.test.ts`
Expected: FAIL

**Step 3: Implement socket.ts**

Create `src/dashboard/socket.ts`:
- `WebSocketBroadcaster` class — wraps `ws` WebSocketServer, tracks clients, broadcasts to all connected

**Step 4: Implement server.ts**

Create `src/dashboard/server.ts`:
- `DashboardServer` class — `node:http` server serving static HTML, creates WebSocketBroadcaster
- `start()`, `stop()`, `isRunning()`, `getUrl()`, `broadcast(event)`

**Step 5: Run tests**

Run: `npx vitest run tests/dashboard/server.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/dashboard/server.ts src/dashboard/socket.ts tests/dashboard/server.test.ts
git commit -m "feat: add dashboard server with WebSocket broadcast"
```

---

## Task 17: Dashboard UI

**Files:**
- Create: `src/dashboard/static/index.html`

**Step 1: Implement the single-file dashboard**

Create `src/dashboard/static/index.html` — single HTML file with inline CSS and vanilla JS:
- Dark theme, monospace font
- Header: title, total cost, duration (live updating)
- Sprint cards: status icon, attempt count, cost per sprint
- Expandable details per sprint: contract summary, per-attempt generator/evaluator results
- Expandable evaluator critique with passed/failed criteria
- Live activity stream showing tool calls in real-time
- Budget progress bar at the bottom
- WebSocket connection to `ws://localhost:{port}` that handles all event types

**Step 2: Wire dashboard into run command**

Modify `src/commands/run.ts`:
- After creating Harness, start DashboardServer if `options.dashboard`
- Forward all harness events to dashboard via `broadcast()`
- Stop dashboard after run completes
- Print dashboard URL to terminal

**Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/dashboard/static/index.html src/commands/run.ts
git commit -m "feat: add dashboard UI with full transparency"
```

---

## Task 18: Public API Exports and Integration Test

**Files:**
- Modify: `src/index.ts`
- Create: `tests/integration/harness.test.ts`

**Step 1: Update index.ts with all public exports**

Rewrite `src/index.ts` to export:
- `Harness`, `FileProtocol`, `ContextManager`, `DashboardServer` classes
- `buildProjectContext`, `detectStack`, `detectRepoType`, `discoverWorkspaces` functions
- `loadConfig`, `loadCriteria`, `buildSystemPrompt`, `DEFAULT_CRITERIA`
- All types from `core/types.ts`

**Step 2: Write integration test**

Create `tests/integration/harness.test.ts`:
- Mock Agent SDK
- Scaffold a minimal temp project with package.json
- Create Harness, run a spec
- Assert phase:start and run:complete events are emitted
- Assert file protocol files were managed

**Step 3: Run integration test**

Run: `npx vitest run tests/integration/harness.test.ts`
Expected: PASS

**Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 5: Build**

Run: `npx tsc`
Expected: Clean build in `dist/`

**Step 6: Verify CLI**

Run: `node dist/cli.js --help`
Expected: Shows all commands

**Step 7: Verify package**

Run: `npm pack --dry-run`
Expected: Lists files, no errors

**Step 8: Commit**

```bash
git add src/index.ts tests/integration/
git commit -m "feat: add public API exports and integration test"
```

**Step 9: Final commit**

```bash
git add -A
git commit -m "feat: agent-harness v0.1.0 complete"
```

---

## Task Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Project scaffold | package.json, tsconfig.json |
| 2 | Core types | src/core/types.ts |
| 3 | Stack detection | src/discovery/stack-detector.ts |
| 4 | Config loader | src/discovery/config-loader.ts |
| 5 | Project context builder | src/discovery/project-context.ts |
| 6 | File protocol | src/core/file-protocol.ts |
| 7 | Default criteria | src/defaults/criteria.ts |
| 8 | Default prompts | src/defaults/prompts.ts |
| 9 | Context manager | src/core/context-manager.ts |
| 10 | Orchestrator | src/core/orchestrator.ts |
| 11 | CLI config command | src/commands/config.ts |
| 12 | CLI run command | src/commands/run.ts |
| 13 | CLI init command | src/commands/init.ts |
| 14 | CLI status + resume | src/commands/status.ts, resume.ts |
| 15 | CLI entry point | src/cli.ts |
| 16 | Dashboard server | src/dashboard/server.ts, socket.ts |
| 17 | Dashboard UI | src/dashboard/static/index.html |
| 18 | Public API + integration | src/index.ts, integration tests |

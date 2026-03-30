# Dashboard Enhancement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the `--dashboard` UI into a split-panel layout with live phase pipeline, sprint details, and real-time `.harness/` file viewer via WebSocket push.

**Architecture:** Left panel (40%) shows a horizontal phase pipeline and clickable sprint cards. Right panel (60%) shows file contents from `.harness/` with tabs for each file. Server watches `.harness/` files with `fs.watch` and pushes `file:update` events over the existing WebSocket. On connect, server sends a full state snapshot. New event types added to the type system.

**Tech Stack:** Node.js HTTP server, `ws` WebSocket, `fs.watch` for file watching, single-file HTML/CSS/JS (no build tools).

---

### Task 1: Add new event types to the type system

**Files:**
- Modify: `src/core/types.ts:104-152`
- Test: `tests/core/types.test.ts`

**Step 1: Write the failing test**

Add to `tests/core/types.test.ts`:

```typescript
it("FileUpdateEvent type has required fields", () => {
  const event: FileUpdateEvent = {
    name: "contract.md",
    content: "# Contract\nCriteria here",
  };
  expect(event.name).toBe("contract.md");
  expect(event.content).toBe("# Contract\nCriteria here");
});

it("StateSnapshotEvent type has required fields", () => {
  const event: StateSnapshotEvent = {
    files: { "spec.md": "# Spec content", "contract.md": null },
    progress: null,
  };
  expect(event.files["spec.md"]).toBe("# Spec content");
  expect(event.files["contract.md"]).toBeNull();
  expect(event.progress).toBeNull();
});

it("HarnessEvent union includes file:update and state:snapshot", () => {
  const fileEvent: HarnessEvent = {
    type: "file:update",
    data: { name: "spec.md", content: "content" },
  };
  expect(fileEvent.type).toBe("file:update");

  const snapshotEvent: HarnessEvent = {
    type: "state:snapshot",
    data: { files: {}, progress: null },
  };
  expect(snapshotEvent.type).toBe("state:snapshot");
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/types.test.ts`
Expected: FAIL — `FileUpdateEvent` and `StateSnapshotEvent` not exported.

**Step 3: Write minimal implementation**

In `src/core/types.ts`, add after `RunCompleteEvent`:

```typescript
export interface FileUpdateEvent {
  name: string;
  content: string;
}

export interface StateSnapshotEvent {
  files: Record<string, string | null>;
  progress: Progress | null;
}
```

Update the `HarnessEvent` union type to add:

```typescript
  | { type: "file:update"; data: FileUpdateEvent }
  | { type: "state:snapshot"; data: StateSnapshotEvent }
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/types.ts tests/core/types.test.ts
git commit -m "feat: add file:update and state:snapshot event types for dashboard"
```

---

### Task 2: Add file-serving API routes and file watcher to DashboardServer

**Files:**
- Modify: `src/dashboard/server.ts`
- Test: `tests/dashboard/server.test.ts`

**Step 1: Write the failing tests**

Add to `tests/dashboard/server.test.ts`:

```typescript
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Add new describe block:
describe("DashboardServer with projectRoot", () => {
  let server: DashboardServer | null = null;
  let tmpRoot: string;
  let harnessDir: string;

  beforeEach(() => {
    tmpRoot = join(tmpdir(), `harness-test-${Date.now()}`);
    harnessDir = join(tmpRoot, ".harness");
    mkdirSync(harnessDir, { recursive: true });
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("serves file content via /api/files/:name", async () => {
    writeFileSync(join(harnessDir, "spec.md"), "# My Spec");
    server = new DashboardServer(0, tmpRoot);
    await server.start();

    const port = server.getPort();
    const res = await fetch(`http://localhost:${port}/api/files/spec.md`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toBe("# My Spec");
  });

  it("returns 404 for missing files via /api/files/:name", async () => {
    server = new DashboardServer(0, tmpRoot);
    await server.start();

    const port = server.getPort();
    const res = await fetch(`http://localhost:${port}/api/files/nonexistent.md`);
    expect(res.status).toBe(404);
  });

  it("only allows whitelisted file names", async () => {
    writeFileSync(join(harnessDir, "secret.md"), "sensitive data");
    server = new DashboardServer(0, tmpRoot);
    await server.start();

    const port = server.getPort();
    const res = await fetch(`http://localhost:${port}/api/files/secret.md`);
    expect(res.status).toBe(403);
  });

  it("getPort returns actual listening port when using port 0", async () => {
    server = new DashboardServer(0, tmpRoot);
    await server.start();
    expect(server.getPort()).toBeGreaterThan(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/dashboard/server.test.ts`
Expected: FAIL — constructor doesn't accept `projectRoot`, no `/api/files/` routing.

**Step 3: Write minimal implementation**

Modify `src/dashboard/server.ts`:

1. Constructor accepts optional `projectRoot?: string`.
2. Add `ALLOWED_FILES` whitelist: `["spec.md", "sprints.md", "contract.md", "evaluation.md", "handoff.md", "progress.md"]`.
3. In `handleRequest`, check if URL starts with `/api/files/`. If so, extract filename, validate against whitelist (403 if not), read from `.harness/<name>` (404 if missing), return JSON `{ content }`.
4. Update `getPort()` to return actual port from `server.address()` when listening (handles port 0).
5. Add `startFileWatcher()` method that uses `fs.watch` on `.harness/` dir, debounces (200ms), reads changed file, broadcasts `file:update` event.
6. Call `startFileWatcher()` from `start()` if `projectRoot` is set.

```typescript
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync, watch, type FSWatcher } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketBroadcaster } from "./socket.js";
import type { HarnessEvent } from "../core/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ALLOWED_FILES = [
  "spec.md", "sprints.md", "contract.md",
  "evaluation.md", "handoff.md", "progress.md",
];

export class DashboardServer {
  private server: Server;
  private broadcaster: WebSocketBroadcaster;
  private port: number;
  private running = false;
  private projectRoot: string | null;
  private fileWatcher: FSWatcher | null = null;
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(port = 3117, projectRoot?: string) {
    this.port = port;
    this.projectRoot = projectRoot ?? null;
    this.server = createServer(this.handleRequest.bind(this));
    this.broadcaster = new WebSocketBroadcaster(this.server);
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url ?? "/";

    // API: serve .harness file content
    if (url.startsWith("/api/files/") && this.projectRoot) {
      const name = url.slice("/api/files/".length);
      if (!ALLOWED_FILES.includes(name)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Forbidden" }));
        return;
      }
      const filePath = join(this.projectRoot, ".harness", name);
      if (!existsSync(filePath)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
        return;
      }
      const content = readFileSync(filePath, "utf-8");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ content }));
      return;
    }

    // Default: serve dashboard HTML
    try {
      const htmlPath = join(__dirname, "static", "index.html");
      const html = readFileSync(htmlPath, "utf-8");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    } catch {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Dashboard file not found");
    }
  }

  private startFileWatcher(): void {
    if (!this.projectRoot) return;
    const harnessDir = join(this.projectRoot, ".harness");
    if (!existsSync(harnessDir)) return;

    this.fileWatcher = watch(harnessDir, (eventType, filename) => {
      if (!filename || !ALLOWED_FILES.includes(filename)) return;

      // Debounce per file (200ms)
      const existing = this.debounceTimers.get(filename);
      if (existing) clearTimeout(existing);

      this.debounceTimers.set(filename, setTimeout(() => {
        this.debounceTimers.delete(filename);
        const filePath = join(harnessDir, filename);
        if (!existsSync(filePath)) return;
        const content = readFileSync(filePath, "utf-8");
        this.broadcast({
          type: "file:update",
          data: { name: filename, content },
        });
      }, 200));
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, () => {
        this.running = true;
        this.startFileWatcher();
        resolve();
      });
      this.server.on("error", reject);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.fileWatcher) {
        this.fileWatcher.close();
        this.fileWatcher = null;
      }
      for (const timer of this.debounceTimers.values()) clearTimeout(timer);
      this.debounceTimers.clear();
      this.broadcaster.close();
      this.server.close(() => {
        this.running = false;
        resolve();
      });
    });
  }

  isRunning(): boolean { return this.running; }

  getUrl(): string { return `http://localhost:${this.getPort()}`; }

  getPort(): number {
    const addr = this.server.address();
    if (addr && typeof addr === "object") return addr.port;
    return this.port;
  }

  broadcast(event: HarnessEvent): void {
    this.broadcaster.broadcast(event);
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/dashboard/server.test.ts`
Expected: ALL PASS

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS (existing tests still work since `projectRoot` is optional)

**Step 6: Commit**

```bash
git add src/dashboard/server.ts tests/dashboard/server.test.ts
git commit -m "feat: add file-serving API routes and file watcher to dashboard server"
```

---

### Task 3: Send state snapshot on WebSocket client connect

**Files:**
- Modify: `src/dashboard/socket.ts`
- Test: `tests/dashboard/server.test.ts`

**Step 1: Write the failing test**

Add to `tests/dashboard/server.test.ts` inside the "with projectRoot" describe:

```typescript
it("sends state:snapshot on WebSocket connect", async () => {
  writeFileSync(join(harnessDir, "spec.md"), "# Test Spec");
  writeFileSync(join(harnessDir, "contract.md"), "# Contract");
  server = new DashboardServer(0, tmpRoot);
  await server.start();

  const port = server.getPort();
  const ws = new WebSocket(`ws://localhost:${port}`);

  const message = await new Promise<string>((resolve) => {
    ws.onmessage = (e) => resolve(e.data as string);
  });

  const event = JSON.parse(message);
  expect(event.type).toBe("state:snapshot");
  expect(event.data.files["spec.md"]).toBe("# Test Spec");
  expect(event.data.files["contract.md"]).toBe("# Contract");
  expect(event.data.files["evaluation.md"]).toBeNull();

  ws.close();
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/dashboard/server.test.ts`
Expected: FAIL — no snapshot sent on connect.

**Step 3: Write minimal implementation**

Modify `src/dashboard/socket.ts` to accept a `getSnapshot` callback:

```typescript
import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import type { HarnessEvent } from "../core/types.js";

export class WebSocketBroadcaster {
  private wss: WebSocketServer;

  constructor(server: Server, getSnapshot?: () => HarnessEvent | null) {
    this.wss = new WebSocketServer({ server });

    if (getSnapshot) {
      this.wss.on("connection", (client) => {
        const snapshot = getSnapshot();
        if (snapshot && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(snapshot));
        }
      });
    }
  }

  broadcast(event: HarnessEvent): void {
    const data = JSON.stringify(event);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  close(): void {
    for (const client of this.wss.clients) {
      client.close();
    }
    this.wss.close();
  }
}
```

Update `DashboardServer` constructor to pass the snapshot getter:

```typescript
this.broadcaster = new WebSocketBroadcaster(this.server, () => this.buildSnapshot());
```

Add `buildSnapshot()` method to `DashboardServer`:

```typescript
private buildSnapshot(): HarnessEvent | null {
  if (!this.projectRoot) return null;
  const harnessDir = join(this.projectRoot, ".harness");
  const files: Record<string, string | null> = {};

  for (const name of ALLOWED_FILES) {
    const filePath = join(harnessDir, name);
    files[name] = existsSync(filePath) ? readFileSync(filePath, "utf-8") : null;
  }

  // Read progress if exists
  let progress = null;
  const progressPath = join(harnessDir, "progress.md");
  if (existsSync(progressPath)) {
    try {
      const { parse } = await import("yaml"); // dynamic import or handle synchronously
      progress = parse(readFileSync(progressPath, "utf-8"));
    } catch { /* ignore parse errors */ }
  }

  return { type: "state:snapshot", data: { files, progress } };
}
```

Note: Since this is synchronous context, use `yaml` parse directly (already a dependency). Import at top of file:

```typescript
import { parse as parseYaml } from "yaml";
```

Then in `buildSnapshot`:

```typescript
if (existsSync(progressPath)) {
  try { progress = parseYaml(readFileSync(progressPath, "utf-8")); } catch {}
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/dashboard/server.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/dashboard/socket.ts src/dashboard/server.ts tests/dashboard/server.test.ts
git commit -m "feat: send state snapshot to WebSocket clients on connect"
```

---

### Task 4: Update run command to pass projectRoot to DashboardServer

**Files:**
- Modify: `src/commands/run.ts:111-121`

**Step 1: Update the dashboard instantiation**

Change:

```typescript
dashboard = new DashboardServer(options.port ?? 3117);
```

To:

```typescript
dashboard = new DashboardServer(options.port ?? 3117, root);
```

This is a one-liner. `root` is already defined as `process.cwd()` on line 45.

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add src/commands/run.ts
git commit -m "feat: pass projectRoot to dashboard server for file watching"
```

---

### Task 5: Rebuild the dashboard HTML — split-panel layout with phase pipeline

**Files:**
- Modify: `src/dashboard/static/index.html`

This is the largest task. The entire file is a single-file HTML/CSS/JS app. Build it in one go since it's a self-contained UI with no external dependencies.

**Step 1: Write the new dashboard HTML**

Replace the entire contents of `src/dashboard/static/index.html` with the new split-panel layout.

**Layout structure:**

```
+--------------------------------------------------+
| [dot] agents-harness    Cost: $X  Duration: Xm   |
+--------------------------------------------------+
| Phase Pipeline:                                   |
| [Plan]→[Decompose]→[Contract]→[Generate]→[Eval]→[Handoff] |
| Sprint 2 of 5 — Attempt 1                        |
+------------------------+-------------------------+
| SPRINTS                | FILE VIEWER              |
|                        | [Spec|Sprints|Contract|  |
| [Sprint 1] ✓ $0.42   |  Evaluation|Handoff]     |
| [Sprint 2] ● $0.00   |                          |
| [Sprint 3] ○          | # Contract               |
|                        | Criteria here...         |
|                        |                          |
+------------------------+-------------------------+
| ▼ Activity Stream (collapsible)                  |
+--------------------------------------------------+
| Budget: $1.23 / $50.00  [========            ]   |
+--------------------------------------------------+
```

**Key CSS/JS design decisions:**
- CSS Grid for the main layout: `grid-template-rows: auto auto 1fr auto auto`
- Left/right split uses `grid-template-columns: 340px 1fr` in the main content row
- Phase pipeline: flex row with circles/connectors, active one pulses via CSS animation
- Sprint cards: clickable, selected state with blue left border
- File viewer tabs: horizontal tab bar, content area with `white-space: pre-wrap` for markdown
- Tab gets a blue dot badge when content updates while not selected
- Auto-switch tab on phase change (contract phase → Contract tab, evaluate → Evaluation tab)
- Activity stream: collapsible at bottom with toggle
- Dark theme matching current GitHub-dark aesthetic

**JS event handling additions:**
- `file:update` → store content in `state.files[name]`, update badge, re-render if active tab
- `state:snapshot` → populate `state.files`, `state.progress`, rebuild all UI
- `phase:start` → update pipeline, auto-switch right panel tab
- Sprint click → set `selectedSprint`, but file viewer always shows current files (since files are global, not per-sprint)

**Full HTML file is ~450 lines.** Here's the structure (implement completely):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>agents-harness</title>
  <style>
    /* Reset + root variables */
    /* Layout: header, pipeline, main (split), activity, budget */
    /* Phase pipeline styles */
    /* Sprint card styles */
    /* File viewer styles with tabs */
    /* Activity stream collapsible */
    /* Budget bar */
    /* Animations: pulse for active phase, fade for updates */
  </style>
</head>
<body>
  <!-- Header: connection dot, title, cost, duration -->
  <!-- Phase pipeline bar -->
  <!-- Sprint label: "Sprint N of M — Attempt K" -->
  <!-- Main split: left (sprint list) + right (file viewer with tabs) -->
  <!-- Collapsible activity stream -->
  <!-- Budget bar -->
  <!-- Run complete banner -->
  <script>
    // State: sprints, files, activities, currentPhase, selectedSprint, activeTab
    // WebSocket connect + reconnect
    // Event handlers: phase:start, agent:activity, evaluation, cost:update,
    //                 sprint:complete, run:complete, file:update, state:snapshot
    // Renderers: pipeline, sprints, file viewer, activity, budget
    // Tab switching + auto-switch on phase
    // Activity toggle
  </script>
</body>
</html>
```

Key behaviors:
- Phase pipeline highlights current phase with a pulsing dot/glow
- When phase changes to `contract`, auto-switch to "Contract" tab
- When phase changes to `generate`, auto-switch to "Contract" tab (generator reads it)
- When phase changes to `evaluate`, auto-switch to "Evaluation" tab
- When `file:update` arrives for a non-active tab, add a blue dot badge to that tab
- Sprint cards show status with color-coded icons: ● yellow (in-progress), ✓ green (passed), ✗ red (failed), ○ gray (pending)
- Click a sprint card to highlight it (visual only — files are always the latest global state)
- Activity stream is collapsible with a ▼/▶ toggle header

**Step 2: Verify by running the server test**

Run: `npx vitest run tests/dashboard/server.test.ts`
Expected: ALL PASS (serves HTML on HTTP request test should still pass)

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add src/dashboard/static/index.html
git commit -m "feat: rebuild dashboard with split-panel layout, phase pipeline, and file viewer"
```

---

### Task 6: Manual integration test

**Step 1: Build the project**

Run: `npx tsc`
Expected: No errors

**Step 2: Verify dashboard loads in browser**

Start a quick test server manually or use the built CLI. The dashboard should:
- Show the split-panel layout
- Show the phase pipeline with all phases dimmed
- Show "Waiting for events..." in the sprint list
- Show empty file viewer tabs
- Show the activity stream (collapsed by default)
- Show the budget bar at 0%
- Connection dot should turn green when WS connects

**Step 3: Commit any fixes if needed**

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/core/types.ts` | Add `FileUpdateEvent`, `StateSnapshotEvent`, extend `HarnessEvent` union |
| `src/dashboard/server.ts` | Add `projectRoot` param, `/api/files/` routes, file watcher, `buildSnapshot()` |
| `src/dashboard/socket.ts` | Add `getSnapshot` callback, send snapshot on client connect |
| `src/commands/run.ts` | Pass `root` to `DashboardServer` constructor |
| `src/dashboard/static/index.html` | Complete rewrite: split-panel, phase pipeline, file viewer tabs, collapsible activity |
| `tests/core/types.test.ts` | Tests for new event types |
| `tests/dashboard/server.test.ts` | Tests for API routes, file whitelist, snapshot on connect |

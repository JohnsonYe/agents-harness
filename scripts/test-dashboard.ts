/**
 * Local dashboard test script.
 * Starts the dashboard server and sends simulated events to exercise the full UI.
 *
 * Usage: npx tsx scripts/test-dashboard.ts
 * Then open http://localhost:3117 in your browser.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DashboardServer } from "../src/dashboard/server.js";
import type { HarnessEvent } from "../src/core/types.js";

const ROOT = process.cwd();
const HARNESS_DIR = join(ROOT, ".harness");

// Ensure .harness dir exists for file watcher
mkdirSync(HARNESS_DIR, { recursive: true });

const server = new DashboardServer(3117, ROOT);

function send(event: HarnessEvent) {
  server.broadcast(event);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function simulate() {
  console.log("Dashboard running at http://localhost:3117");
  console.log("Simulating a 3-sprint run...\n");

  await sleep(2000);

  // --- Phase 1: Plan ---
  send({ type: "phase:start", data: { sprint: 0, phase: "plan", attempt: 0 } });
  console.log("  [plan] started");

  await sleep(1000);
  send({ type: "agent:activity", data: { sprint: 0, role: "planner", tool: "Read", summary: "Reading spec.md", timestamp: Date.now() } });

  await sleep(1500);
  const specContent = `# Product Specification

## Overview
Build a real-time notification system with WebSocket support.

## Requirements
1. Users can receive notifications in real-time
2. Notifications persist in a SQLite database
3. Read/unread status toggle
4. WebSocket reconnection with exponential backoff
5. REST API for notification history

## Non-functional
- Must handle 1000 concurrent connections
- Notification delivery < 100ms p99
`;
  writeFileSync(join(HARNESS_DIR, "spec.md"), specContent);
  send({ type: "agent:activity", data: { sprint: 0, role: "planner", tool: "Write", summary: "Wrote expanded specification to spec.md", timestamp: Date.now() } });
  send({ type: "cost:update", data: { sprintCostUsd: 0.12, totalCostUsd: 0.12, budgetUsd: 10 } });

  await sleep(2000);

  // --- Phase 2: Decompose ---
  send({ type: "phase:start", data: { sprint: 0, phase: "decompose", attempt: 0 } });
  console.log("  [decompose] started");

  await sleep(1500);
  const sprintsContent = `# Sprint Plan

## Sprint 1: Database & Models
Set up SQLite database, create notification model, write CRUD operations.
- Create schema with migrations
- Implement NotificationRepository class
- Unit tests for all CRUD operations

## Sprint 2: WebSocket Server
Implement WebSocket server with connection management.
- WebSocket upgrade handler
- Connection registry with heartbeat
- Reconnection with exponential backoff
- Broadcast to specific users

## Sprint 3: REST API & Integration
Build REST endpoints and wire everything together.
- GET /notifications - list with pagination
- PATCH /notifications/:id - mark read/unread
- POST /notifications - create (admin)
- Integration tests
`;
  writeFileSync(join(HARNESS_DIR, "sprints.md"), sprintsContent);
  send({ type: "agent:activity", data: { sprint: 0, role: "planner", tool: "Write", summary: "Wrote sprint plan to sprints.md (3 sprints)", timestamp: Date.now() } });
  send({ type: "cost:update", data: { sprintCostUsd: 0.08, totalCostUsd: 0.20, budgetUsd: 10 } });

  await sleep(2000);

  // --- Sprint 1 ---
  // Contract
  send({ type: "phase:start", data: { sprint: 1, phase: "contract", attempt: 0 } });
  console.log("  [sprint 1] contract");

  await sleep(1200);
  const contract1 = `# Sprint 1 Contract: Database & Models

## Success Criteria
- [ ] SQLite database created with notifications table
- [ ] NotificationRepository class with create, findById, findAll, update, delete
- [ ] Notification model with fields: id, userId, title, body, read, createdAt
- [ ] All CRUD operations covered by unit tests
- [ ] Tests pass with \`npm test\`

## Acceptance
All criteria must pass for sprint to be considered complete.
`;
  writeFileSync(join(HARNESS_DIR, "contract.md"), contract1);
  send({ type: "agent:activity", data: { sprint: 1, role: "planner", tool: "Write", summary: "Wrote sprint 1 contract with 5 criteria", timestamp: Date.now() } });
  send({ type: "cost:update", data: { sprintCostUsd: 0.05, totalCostUsd: 0.25, budgetUsd: 10 } });

  await sleep(2000);

  // Generate (attempt 1)
  send({ type: "phase:start", data: { sprint: 1, phase: "generate", attempt: 1 } });
  console.log("  [sprint 1] generate attempt 1");

  await sleep(800);
  send({ type: "agent:activity", data: { sprint: 1, role: "generator", tool: "Write", summary: "Created src/db/schema.ts", timestamp: Date.now() } });
  await sleep(600);
  send({ type: "agent:activity", data: { sprint: 1, role: "generator", tool: "Write", summary: "Created src/models/notification.ts", timestamp: Date.now() } });
  await sleep(700);
  send({ type: "agent:activity", data: { sprint: 1, role: "generator", tool: "Write", summary: "Created src/repositories/notification-repository.ts", timestamp: Date.now() } });
  await sleep(500);
  send({ type: "agent:activity", data: { sprint: 1, role: "generator", tool: "Write", summary: "Created tests/repositories/notification-repository.test.ts", timestamp: Date.now() } });
  await sleep(400);
  send({ type: "agent:activity", data: { sprint: 1, role: "generator", tool: "Bash", summary: "Ran npm test — 8 tests passed", timestamp: Date.now() } });
  send({ type: "cost:update", data: { sprintCostUsd: 0.45, totalCostUsd: 0.70, budgetUsd: 10 } });

  await sleep(1500);

  // Evaluate (attempt 1)
  send({ type: "phase:start", data: { sprint: 1, phase: "evaluate", attempt: 1 } });
  console.log("  [sprint 1] evaluate attempt 1");

  await sleep(1500);
  const eval1 = `Status: PASS

Passed criteria:
- SQLite database created with notifications table
- NotificationRepository class with create, findById, findAll, update, delete
- Notification model with fields: id, userId, title, body, read, createdAt
- All CRUD operations covered by unit tests
- Tests pass with npm test

Failed criteria:

Critique:
Clean implementation. Good test coverage.
`;
  writeFileSync(join(HARNESS_DIR, "evaluation.md"), eval1);
  send({ type: "evaluation", data: { sprint: 1, attempt: 1, result: { passed: true, critique: "Clean implementation. Good test coverage.", failedCriteria: [], passedCriteria: ["SQLite database created", "NotificationRepository CRUD", "Notification model", "Unit tests", "Tests pass"] } } });
  send({ type: "sprint:complete", data: { sprint: 1, status: "passed", attempts: 1, costUsd: 0.50 } });
  send({ type: "cost:update", data: { sprintCostUsd: 0.50, totalCostUsd: 0.75, budgetUsd: 10 } });
  console.log("  [sprint 1] PASSED");

  await sleep(1500);

  // Handoff
  send({ type: "phase:start", data: { sprint: 1, phase: "handoff", attempt: 0 } });
  const handoff1 = `# Sprint 1 Handoff

## Completed
- SQLite database with notifications table
- NotificationRepository with full CRUD
- 8 unit tests all passing

## Key Files
- src/db/schema.ts — database initialization
- src/models/notification.ts — type definitions
- src/repositories/notification-repository.ts — data access

## Notes for Sprint 2
- Database exports a singleton connection via getDb()
- Repository is stateless, takes db connection in constructor
`;
  writeFileSync(join(HARNESS_DIR, "handoff.md"), handoff1);
  send({ type: "agent:activity", data: { sprint: 1, role: "planner", tool: "Write", summary: "Wrote handoff document for Sprint 2", timestamp: Date.now() } });

  await sleep(2000);

  // --- Sprint 2 (fails first attempt, passes second) ---
  send({ type: "phase:start", data: { sprint: 2, phase: "contract", attempt: 0 } });
  console.log("  [sprint 2] contract");

  await sleep(1000);
  const contract2 = `# Sprint 2 Contract: WebSocket Server

## Success Criteria
- [ ] WebSocket server with upgrade handler on /ws
- [ ] Connection registry tracking active connections by userId
- [ ] Heartbeat ping/pong every 30s, disconnect stale clients
- [ ] Reconnection with exponential backoff (client-side)
- [ ] Broadcast method to send notification to specific userId
- [ ] Integration test with real WebSocket connections
`;
  writeFileSync(join(HARNESS_DIR, "contract.md"), contract2);
  send({ type: "cost:update", data: { sprintCostUsd: 0.04, totalCostUsd: 0.84, budgetUsd: 10 } });

  await sleep(2000);

  // Generate attempt 1
  send({ type: "phase:start", data: { sprint: 2, phase: "generate", attempt: 1 } });
  console.log("  [sprint 2] generate attempt 1");

  await sleep(800);
  send({ type: "agent:activity", data: { sprint: 2, role: "generator", tool: "Write", summary: "Created src/ws/server.ts", timestamp: Date.now() } });
  await sleep(600);
  send({ type: "agent:activity", data: { sprint: 2, role: "generator", tool: "Write", summary: "Created src/ws/connection-registry.ts", timestamp: Date.now() } });
  await sleep(500);
  send({ type: "agent:activity", data: { sprint: 2, role: "generator", tool: "Bash", summary: "Ran npm test — 2 failures", timestamp: Date.now() } });
  send({ type: "cost:update", data: { sprintCostUsd: 0.35, totalCostUsd: 1.19, budgetUsd: 10 } });

  await sleep(1500);

  // Evaluate attempt 1 — FAIL
  send({ type: "phase:start", data: { sprint: 2, phase: "evaluate", attempt: 1 } });
  console.log("  [sprint 2] evaluate attempt 1 — FAIL");

  await sleep(1200);
  const eval2fail = `Status: FAIL

Passed criteria:
- WebSocket server with upgrade handler on /ws
- Connection registry tracking active connections by userId
- Broadcast method to send notification to specific userId

Failed criteria:
- Heartbeat ping/pong every 30s, disconnect stale clients
- Reconnection with exponential backoff (client-side)
- Integration test with real WebSocket connections

Critique:
Missing heartbeat implementation entirely. No client-side reconnection logic. Integration tests reference modules that don't exist yet.
`;
  writeFileSync(join(HARNESS_DIR, "evaluation.md"), eval2fail);
  send({ type: "evaluation", data: { sprint: 2, attempt: 1, result: { passed: false, critique: "Missing heartbeat implementation entirely. No client-side reconnection logic.", failedCriteria: ["Heartbeat ping/pong", "Reconnection with backoff", "Integration tests"], passedCriteria: ["WebSocket upgrade handler", "Connection registry", "Broadcast method"] } } });
  send({ type: "cost:update", data: { sprintCostUsd: 0.42, totalCostUsd: 1.26, budgetUsd: 10 } });

  await sleep(2500);

  // Generate attempt 2
  send({ type: "phase:start", data: { sprint: 2, phase: "generate", attempt: 2 } });
  console.log("  [sprint 2] generate attempt 2");

  await sleep(700);
  send({ type: "agent:activity", data: { sprint: 2, role: "generator", tool: "Read", summary: "Reading evaluation.md for feedback", timestamp: Date.now() } });
  await sleep(600);
  send({ type: "agent:activity", data: { sprint: 2, role: "generator", tool: "Edit", summary: "Added heartbeat to connection-registry.ts", timestamp: Date.now() } });
  await sleep(500);
  send({ type: "agent:activity", data: { sprint: 2, role: "generator", tool: "Write", summary: "Created src/ws/reconnect.ts (client helper)", timestamp: Date.now() } });
  await sleep(400);
  send({ type: "agent:activity", data: { sprint: 2, role: "generator", tool: "Write", summary: "Created tests/ws/integration.test.ts", timestamp: Date.now() } });
  await sleep(500);
  send({ type: "agent:activity", data: { sprint: 2, role: "generator", tool: "Bash", summary: "Ran npm test — 14 tests passed", timestamp: Date.now() } });
  send({ type: "cost:update", data: { sprintCostUsd: 0.78, totalCostUsd: 1.62, budgetUsd: 10 } });

  await sleep(1500);

  // Evaluate attempt 2 — PASS
  send({ type: "phase:start", data: { sprint: 2, phase: "evaluate", attempt: 2 } });
  console.log("  [sprint 2] evaluate attempt 2 — PASS");

  await sleep(1200);
  const eval2pass = `Status: PASS

Passed criteria:
- WebSocket server with upgrade handler on /ws
- Connection registry tracking active connections by userId
- Heartbeat ping/pong every 30s, disconnect stale clients
- Reconnection with exponential backoff (client-side)
- Broadcast method to send notification to specific userId
- Integration test with real WebSocket connections

Failed criteria:

Critique:
All criteria met. Heartbeat and reconnection properly implemented on second attempt.
`;
  writeFileSync(join(HARNESS_DIR, "evaluation.md"), eval2pass);
  send({ type: "evaluation", data: { sprint: 2, attempt: 2, result: { passed: true, critique: "All criteria met. Heartbeat and reconnection properly implemented on second attempt.", failedCriteria: [], passedCriteria: ["WebSocket upgrade handler", "Connection registry", "Heartbeat ping/pong", "Reconnection with backoff", "Broadcast method", "Integration tests"] } } });
  send({ type: "sprint:complete", data: { sprint: 2, status: "passed", attempts: 2, costUsd: 0.82 } });
  console.log("  [sprint 2] PASSED (2 attempts)");

  await sleep(1500);

  // Handoff 2
  send({ type: "phase:start", data: { sprint: 2, phase: "handoff", attempt: 0 } });
  const handoff2 = `# Sprint 2 Handoff

## Completed
- WebSocket server on /ws path
- Connection registry with heartbeat (30s interval)
- Client-side reconnection helper with exponential backoff
- 6 new tests (14 total)

## Key Files
- src/ws/server.ts — WebSocket upgrade + message handling
- src/ws/connection-registry.ts — tracks connections, heartbeat
- src/ws/reconnect.ts — client reconnection utility
`;
  writeFileSync(join(HARNESS_DIR, "handoff.md"), handoff2);

  await sleep(2000);

  // --- Sprint 3 ---
  send({ type: "phase:start", data: { sprint: 3, phase: "contract", attempt: 0 } });
  console.log("  [sprint 3] contract");

  await sleep(1000);
  const contract3 = `# Sprint 3 Contract: REST API & Integration

## Success Criteria
- [ ] GET /notifications returns paginated list (limit, offset)
- [ ] PATCH /notifications/:id toggles read/unread status
- [ ] POST /notifications creates notification and broadcasts via WebSocket
- [ ] Input validation with proper error responses (400, 404)
- [ ] Integration test covering full flow: create → broadcast → read
`;
  writeFileSync(join(HARNESS_DIR, "contract.md"), contract3);
  send({ type: "cost:update", data: { sprintCostUsd: 0.04, totalCostUsd: 1.70, budgetUsd: 10 } });

  await sleep(2000);

  send({ type: "phase:start", data: { sprint: 3, phase: "generate", attempt: 1 } });
  console.log("  [sprint 3] generate attempt 1");

  await sleep(700);
  send({ type: "agent:activity", data: { sprint: 3, role: "generator", tool: "Write", summary: "Created src/routes/notifications.ts", timestamp: Date.now() } });
  await sleep(500);
  send({ type: "agent:activity", data: { sprint: 3, role: "generator", tool: "Write", summary: "Created src/middleware/validation.ts", timestamp: Date.now() } });
  await sleep(600);
  send({ type: "agent:activity", data: { sprint: 3, role: "generator", tool: "Write", summary: "Created tests/routes/notifications.test.ts", timestamp: Date.now() } });
  await sleep(400);
  send({ type: "agent:activity", data: { sprint: 3, role: "generator", tool: "Bash", summary: "Ran npm test — 22 tests passed", timestamp: Date.now() } });
  send({ type: "cost:update", data: { sprintCostUsd: 0.38, totalCostUsd: 2.08, budgetUsd: 10 } });

  await sleep(1500);

  send({ type: "phase:start", data: { sprint: 3, phase: "evaluate", attempt: 1 } });
  console.log("  [sprint 3] evaluate attempt 1 — PASS");

  await sleep(1200);
  send({ type: "evaluation", data: { sprint: 3, attempt: 1, result: { passed: true, critique: "All REST endpoints working correctly. Full integration test passes.", failedCriteria: [], passedCriteria: ["GET paginated list", "PATCH read/unread toggle", "POST create + broadcast", "Input validation", "Integration test"] } } });
  send({ type: "sprint:complete", data: { sprint: 3, status: "passed", attempts: 1, costUsd: 0.42 } });
  send({ type: "cost:update", data: { sprintCostUsd: 0.42, totalCostUsd: 2.15, budgetUsd: 10 } });
  console.log("  [sprint 3] PASSED");

  await sleep(1500);

  // Write progress.md so late-connecting clients get sprint state via snapshot
  const { stringify } = await import("yaml");
  const progress = {
    status: "completed",
    runSpec: "Build a real-time notification system",
    currentSprint: 3,
    totalSprints: 3,
    currentAttempt: 1,
    currentPhase: "evaluate",
    startedAt: new Date(Date.now() - 42000).toISOString(),
    costUsd: 2.15,
    maxBudgetUsd: 10,
    sprints: {
      1: { status: "passed", attempts: 1, costUsd: 0.50 },
      2: { status: "passed", attempts: 2, costUsd: 0.82 },
      3: { status: "passed", attempts: 1, costUsd: 0.42 },
    },
  };
  writeFileSync(join(HARNESS_DIR, "progress.md"), stringify(progress));

  // --- Run Complete ---
  send({ type: "run:complete", data: { status: "completed", totalSprints: 3, totalCostUsd: 2.15, durationMs: 42000 } });
  console.log("\nSimulation complete! Dashboard should show full run.");
  console.log("Press Ctrl+C to stop.\n");
}

(async () => {
  await server.start();
  await simulate();
})();

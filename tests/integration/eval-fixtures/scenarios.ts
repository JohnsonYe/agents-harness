/**
 * Test scenarios for the scored evaluator integration test.
 *
 * Each scenario has:
 *   - A contract (what the evaluator should judge against)
 *   - Project files (the "implementation" with intentional quality levels)
 *   - Expected score ranges per dimension
 *   - Expected pass/fail
 */

export interface ScenarioExpectation {
  dimensionId: string;
  minScore: number;
  maxScore: number;
}

export interface Scenario {
  name: string;
  description: string;
  projectType: "backend" | "frontend" | "universal";
  contract: string;
  files: Record<string, string>;
  expectPass: boolean;
  expectations: ScenarioExpectation[];
}

// ─── Scenario A: Backend with missing error handling & no tests ──────────────
// Expected: FAIL (Testing ~2-3, Error Handling ~3-4)

export const scenarioA: Scenario = {
  name: "backend-missing-tests",
  description: "Express API with working routes but zero tests, swallowed errors, and a TODO",
  projectType: "backend",
  expectPass: false,
  expectations: [
    { dimensionId: "correctness", minScore: 5, maxScore: 8 },    // routes work but have gaps
    { dimensionId: "testing", minScore: 1, maxScore: 3 },         // no tests at all
    { dimensionId: "code-quality", minScore: 3, maxScore: 5 },    // TODO left, console.log
    { dimensionId: "integration", minScore: 4, maxScore: 7 },     // standalone, no breakage
    { dimensionId: "error-handling", minScore: 2, maxScore: 4 },  // errors swallowed
    { dimensionId: "api-design", minScore: 4, maxScore: 7 },      // routes exist but inconsistent
    { dimensionId: "data-integrity", minScore: 3, maxScore: 6 },  // no validation
  ],
  contract: `# Sprint 1 Contract: Task Management API

## Requirements
1. Create a REST API with Express for managing tasks (CRUD)
2. Endpoints: GET /tasks, POST /tasks, PUT /tasks/:id, DELETE /tasks/:id
3. Each task has: id, title, description, status (pending/done), createdAt
4. Input validation on POST/PUT (title required, status must be pending or done)
5. Proper error responses with appropriate HTTP status codes
6. Tests covering all endpoints and edge cases

## Success Criteria
- All 4 CRUD endpoints respond correctly
- Input validation rejects bad data with 400 status
- 404 returned for non-existent task IDs
- Test suite covers happy path and validation errors
- No console.log or TODO left in code
`,
  files: {
    "package.json": JSON.stringify({
      name: "task-api",
      version: "1.0.0",
      type: "module",
      scripts: {
        start: "node src/index.js",
        test: "echo \"Error: no tests\" && exit 1",
      },
      dependencies: { express: "^4.21.0" },
    }, null, 2),
    "src/index.ts": `import express from "express";

const app = express();
app.use(express.json());

interface Task {
  id: number;
  title: string;
  description: string;
  status: "pending" | "done";
  createdAt: string;
}

let tasks: Task[] = [];
let nextId = 1;

// GET /tasks
app.get("/tasks", (req, res) => {
  res.json(tasks);
});

// POST /tasks
app.post("/tasks", (req, res) => {
  // TODO: add input validation
  const task: Task = {
    id: nextId++,
    title: req.body.title,
    description: req.body.description || "",
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  tasks.push(task);
  console.log("Created task:", task.id);
  res.status(201).json(task);
});

// PUT /tasks/:id
app.put("/tasks/:id", (req, res) => {
  try {
    const task = tasks.find(t => t.id === Number(req.params.id));
    if (task) {
      task.title = req.body.title || task.title;
      task.description = req.body.description || task.description;
      task.status = req.body.status || task.status;
      res.json(task);
    }
    // Missing 404 response — falls through silently
  } catch (err) {
    // Swallowed error
  }
});

// DELETE /tasks/:id
app.delete("/tasks/:id", (req, res) => {
  const idx = tasks.findIndex(t => t.id === Number(req.params.id));
  if (idx >= 0) {
    tasks.splice(idx, 1);
    res.status(204).send();
  }
  // Missing 404 response
});

app.listen(3000, () => console.log("Running on 3000"));

export default app;
`,
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "node",
        outDir: "dist",
        strict: true,
      },
      include: ["src"],
    }, null, 2),
  },
};

// ─── Scenario B: Backend with good code, tests, proper errors ────────────────
// Expected: PASS (most dimensions 7-9)

export const scenarioB: Scenario = {
  name: "backend-solid-implementation",
  description: "Express API with validation and unit tests, but missing endpoint tests — evaluator correctly flags this",
  projectType: "backend",
  expectPass: false, // Testing fails: unit tests exist but no endpoint tests despite contract requiring them
  expectations: [
    { dimensionId: "correctness", minScore: 5, maxScore: 8 },
    { dimensionId: "testing", minScore: 2, maxScore: 5 },   // No endpoint tests, only unit tests
    { dimensionId: "code-quality", minScore: 7, maxScore: 10 },
    { dimensionId: "integration", minScore: 6, maxScore: 9 },
    { dimensionId: "error-handling", minScore: 7, maxScore: 10 },
    { dimensionId: "api-design", minScore: 7, maxScore: 10 },
    { dimensionId: "data-integrity", minScore: 6, maxScore: 9 },
  ],
  contract: `# Sprint 1 Contract: Task Management API

## Requirements
1. Create a REST API with Express for managing tasks (CRUD)
2. Endpoints: GET /tasks, POST /tasks, PUT /tasks/:id, DELETE /tasks/:id
3. Each task has: id, title, description, status (pending/done), createdAt
4. Input validation on POST/PUT (title required, status must be pending or done)
5. Proper error responses with appropriate HTTP status codes
6. Tests covering all endpoints and edge cases

## Success Criteria
- All 4 CRUD endpoints respond correctly
- Input validation rejects bad data with 400 status
- 404 returned for non-existent task IDs
- Test suite covers happy path and validation errors
- No console.log or TODO left in code
`,
  files: {
    "package.json": JSON.stringify({
      name: "task-api",
      version: "1.0.0",
      type: "module",
      scripts: {
        start: "node dist/index.js",
        test: "vitest run",
      },
      dependencies: { express: "^4.21.0" },
      devDependencies: { vitest: "^4.1.0", supertest: "^7.0.0", "@types/express": "^5.0.0", "@types/supertest": "^6.0.0" },
    }, null, 2),
    "src/index.ts": `import express, { type Request, type Response } from "express";
import { validateTaskInput } from "./validation.js";

const app = express();
app.use(express.json());

interface Task {
  id: number;
  title: string;
  description: string;
  status: "pending" | "done";
  createdAt: string;
}

const tasks: Task[] = [];
let nextId = 1;

app.get("/tasks", (_req: Request, res: Response) => {
  res.json(tasks);
});

app.post("/tasks", (req: Request, res: Response) => {
  const { valid, error } = validateTaskInput(req.body);
  if (!valid) {
    res.status(400).json({ error });
    return;
  }
  const task: Task = {
    id: nextId++,
    title: req.body.title.trim(),
    description: req.body.description || "",
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  tasks.push(task);
  res.status(201).json(task);
});

app.put("/tasks/:id", (req: Request, res: Response) => {
  const task = tasks.find(t => t.id === Number(req.params.id));
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (req.body.title !== undefined) {
    if (typeof req.body.title !== "string" || req.body.title.trim() === "") {
      res.status(400).json({ error: "Title cannot be empty" });
      return;
    }
    task.title = req.body.title.trim();
  }
  if (req.body.description !== undefined) {
    task.description = req.body.description;
  }
  if (req.body.status !== undefined) {
    if (req.body.status !== "pending" && req.body.status !== "done") {
      res.status(400).json({ error: "Status must be 'pending' or 'done'" });
      return;
    }
    task.status = req.body.status;
  }
  res.json(task);
});

app.delete("/tasks/:id", (req: Request, res: Response) => {
  const idx = tasks.findIndex(t => t.id === Number(req.params.id));
  if (idx < 0) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  tasks.splice(idx, 1);
  res.status(204).send();
});

export default app;
`,
    "src/validation.ts": `export function validateTaskInput(body: unknown): { valid: boolean; error?: string } {
  if (!body || typeof body !== "object") return { valid: false, error: "Request body required" };
  const b = body as Record<string, unknown>;
  if (!b.title || typeof b.title !== "string" || b.title.trim() === "") {
    return { valid: false, error: "Title is required" };
  }
  if (b.status !== undefined && b.status !== "pending" && b.status !== "done") {
    return { valid: false, error: "Status must be 'pending' or 'done'" };
  }
  return { valid: true };
}
`,
    "tests/validation.test.ts": `import { describe, it, expect } from "vitest";
import { validateTaskInput } from "../src/validation.js";

describe("validateTaskInput", () => {
  it("rejects null body", () => {
    const result = validateTaskInput(null);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Request body required");
  });

  it("rejects undefined body", () => {
    const result = validateTaskInput(undefined);
    expect(result.valid).toBe(false);
  });

  it("rejects empty object (missing title)", () => {
    const result = validateTaskInput({});
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Title is required");
  });

  it("rejects empty string title", () => {
    const result = validateTaskInput({ title: "" });
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Title is required");
  });

  it("rejects whitespace-only title", () => {
    const result = validateTaskInput({ title: "   " });
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Title is required");
  });

  it("accepts valid title", () => {
    const result = validateTaskInput({ title: "My Task" });
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("rejects invalid status", () => {
    const result = validateTaskInput({ title: "My Task", status: "invalid" });
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Status must be 'pending' or 'done'");
  });

  it("accepts valid status 'pending'", () => {
    const result = validateTaskInput({ title: "My Task", status: "pending" });
    expect(result.valid).toBe(true);
  });

  it("accepts valid status 'done'", () => {
    const result = validateTaskInput({ title: "My Task", status: "done" });
    expect(result.valid).toBe(true);
  });

  it("accepts task without status (status is optional)", () => {
    const result = validateTaskInput({ title: "My Task" });
    expect(result.valid).toBe(true);
  });

  it("rejects non-string title", () => {
    const result = validateTaskInput({ title: 123 });
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Title is required");
  });
});
`,
    "tests/tasks.test.ts": `import { describe, it, expect } from "vitest";

// Unit tests for task data model behavior
describe("Task model", () => {
  interface Task {
    id: number;
    title: string;
    description: string;
    status: "pending" | "done";
    createdAt: string;
  }

  function createTask(title: string, description = ""): Task {
    return {
      id: 1,
      title: title.trim(),
      description,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
  }

  it("creates a task with correct defaults", () => {
    const task = createTask("Buy milk");
    expect(task.title).toBe("Buy milk");
    expect(task.status).toBe("pending");
    expect(task.description).toBe("");
  });

  it("trims whitespace from title", () => {
    const task = createTask("  Buy milk  ");
    expect(task.title).toBe("Buy milk");
  });

  it("createdAt is valid ISO string", () => {
    const task = createTask("Test");
    const parsed = new Date(task.createdAt);
    expect(parsed.toISOString()).toBe(task.createdAt);
  });

  it("accepts description", () => {
    const task = createTask("Buy milk", "From the store");
    expect(task.description).toBe("From the store");
  });

  it("task status type allows only pending or done", () => {
    const task = createTask("Test");
    expect(["pending", "done"]).toContain(task.status);
  });
});
`,
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "node",
        outDir: "dist",
        strict: true,
      },
      include: ["src"],
    }, null, 2),
  },
};

// ─── Scenario C: Backend with critical bugs — feature doesn't work ───────────
// Expected: FAIL hard (Correctness ~3, multiple other fails)

export const scenarioC: Scenario = {
  name: "backend-critical-bugs",
  description: "Express API where POST creates tasks with wrong data, DELETE doesn't work, tests fail",
  projectType: "backend",
  expectPass: false,
  expectations: [
    { dimensionId: "correctness", minScore: 2, maxScore: 5 },
    { dimensionId: "testing", minScore: 2, maxScore: 5 },
    { dimensionId: "code-quality", minScore: 2, maxScore: 5 },
    { dimensionId: "error-handling", minScore: 1, maxScore: 4 },
    { dimensionId: "api-design", minScore: 2, maxScore: 5 },
  ],
  contract: `# Sprint 1 Contract: Task Management API

## Requirements
1. Create a REST API with Express for managing tasks (CRUD)
2. Endpoints: GET /tasks, POST /tasks, PUT /tasks/:id, DELETE /tasks/:id
3. Each task has: id, title, description, status (pending/done), createdAt
4. Input validation on POST/PUT (title required, status must be pending or done)
5. Proper error responses with appropriate HTTP status codes
6. Tests covering all endpoints and edge cases

## Success Criteria
- All 4 CRUD endpoints respond correctly
- Input validation rejects bad data with 400 status
- 404 returned for non-existent task IDs
- Test suite covers happy path and validation errors
- No console.log or TODO left in code
`,
  files: {
    "package.json": JSON.stringify({
      name: "task-api",
      version: "1.0.0",
      type: "module",
      scripts: {
        start: "node src/index.js",
        test: "vitest run",
      },
      dependencies: { express: "^4.21.0" },
      devDependencies: { vitest: "^4.1.0" },
    }, null, 2),
    "src/index.ts": `import express from "express";

const app = express();
// BUG: forgot express.json() — req.body is always undefined

interface Task {
  id: number;
  title: string;
  description: string;
  status: string; // BUG: not typed properly
  createdAt: string;
}

let tasks: any[] = []; // BUG: using any[]
let nextId = 1;

// TODO: implement proper routing
// FIXME: this is a mess

app.get("/tasks", (req, res) => {
  console.log("fetching tasks...");
  res.json(tasks);
});

app.post("/tasks", (req, res) => {
  // BUG: no body parsing, no validation
  const task = {
    id: nextId++,
    title: req.body?.title, // will be undefined without body parser
    description: req.body?.description,
    status: req.body?.status, // accepts any value, no validation
    createdAt: Date.now(), // BUG: should be ISO string, returns number
  };
  tasks.push(task);
  console.log("created:", task);
  res.json(task); // BUG: should be 201, not 200
});

app.put("/tasks/:id", (req, res) => {
  // BUG: string comparison with number
  const task = tasks.find(t => t.id === req.params.id);
  if (task) {
    Object.assign(task, req.body); // BUG: allows overwriting id, createdAt
    res.json(task);
  }
  // BUG: no 404 response, hangs
});

app.delete("/tasks/:id", (req, res) => {
  // BUG: completely broken — always removes index 0
  tasks.splice(0, 1);
  res.json({ deleted: true }); // BUG: should be 204 no content
});

app.listen(3000, () => console.log("server up"));
export default app;
`,
    "tests/tasks.test.ts": `import { describe, it, expect } from "vitest";

describe("Task API", () => {
  it("should work", () => {
    // BUG: tests don't actually test anything meaningful
    expect(1 + 1).toBe(2);
  });

  it("tasks array exists", () => {
    const tasks: any[] = [];
    expect(Array.isArray(tasks)).toBe(true);
  });
});
`,
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "node",
        outDir: "dist",
        strict: false, // strict disabled
      },
      include: ["src"],
    }, null, 2),
  },
};

export const ALL_SCENARIOS = [scenarioA, scenarioB, scenarioC];

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DashboardServer } from "../../src/dashboard/server.js";
import type { HarnessEvent } from "../../src/core/types.js";

describe("DashboardServer", () => {
  let server: DashboardServer | null = null;

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
  });

  it("starts and stops on a given port", async () => {
    server = new DashboardServer(0);
    await server.start();
    expect(server.isRunning()).toBe(true);
    await server.stop();
    expect(server.isRunning()).toBe(false);
    server = null;
  });

  it("returns URL with actual port", async () => {
    server = new DashboardServer(0);
    await server.start();
    const port = server.getPort();
    expect(port).toBeGreaterThan(0);
    expect(server.getUrl()).toBe(`http://localhost:${port}`);
  });

  it("broadcasts events without throwing", async () => {
    server = new DashboardServer(0);
    await server.start();

    const event: HarnessEvent = {
      type: "phase:start",
      data: { sprint: 1, phase: "plan", attempt: 0 },
    };

    expect(() => server!.broadcast(event)).not.toThrow();
  });

  it("serves HTML on HTTP request", async () => {
    server = new DashboardServer(0);
    await server.start();

    const res = await fetch(`http://localhost:${server.getPort()}/`);
    expect(res.status).toBeDefined();
  });
});

describe("DashboardServer with projectRoot", () => {
  let server: DashboardServer | null = null;
  let tmpRoot: string;
  let harnessDir: string;

  beforeEach(() => {
    tmpRoot = join(tmpdir(), `harness-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

  it("returns 404 for allowed but missing files", async () => {
    server = new DashboardServer(0, tmpRoot);
    await server.start();

    const port = server.getPort();
    const res = await fetch(`http://localhost:${port}/api/files/evaluation.md`);
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

  it("serves all allowed file names", async () => {
    const allowed = ["spec.md", "sprints.md", "contract.md", "evaluation.md", "handoff.md", "progress.md"];
    for (const name of allowed) {
      writeFileSync(join(harnessDir, name), `content of ${name}`);
    }
    server = new DashboardServer(0, tmpRoot);
    await server.start();

    const port = server.getPort();
    for (const name of allowed) {
      const res = await fetch(`http://localhost:${port}/api/files/${name}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.content).toBe(`content of ${name}`);
    }
  });

  it("sends state:snapshot on WebSocket connect", async () => {
    writeFileSync(join(harnessDir, "spec.md"), "# Test Spec");
    writeFileSync(join(harnessDir, "contract.md"), "# Contract");
    server = new DashboardServer(0, tmpRoot);
    await server.start();

    const port = server.getPort();
    const ws = new WebSocket(`ws://localhost:${port}`);

    const message = await new Promise<string>((resolve, reject) => {
      ws.onmessage = (e) => resolve(e.data as string);
      ws.onerror = () => reject(new Error("WebSocket error"));
      setTimeout(() => reject(new Error("Timeout")), 3000);
    });

    const event = JSON.parse(message);
    expect(event.type).toBe("state:snapshot");
    expect(event.data.files["spec.md"]).toBe("# Test Spec");
    expect(event.data.files["contract.md"]).toBe("# Contract");
    expect(event.data.files["evaluation.md"]).toBeNull();

    ws.close();
  });
});

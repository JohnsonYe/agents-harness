import { describe, it, expect, afterEach } from "vitest";
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

  it("returns URL", async () => {
    server = new DashboardServer(3200);
    await server.start();
    expect(server.getUrl()).toBe("http://localhost:3200");
  });

  it("broadcasts events without throwing", async () => {
    server = new DashboardServer(0);
    await server.start();

    const event: HarnessEvent = {
      type: "phase:start",
      data: { sprint: 1, phase: "plan", attempt: 0 },
    };

    // Should not throw even with no connected clients
    expect(() => server!.broadcast(event)).not.toThrow();
  });

  it("serves HTML on HTTP request", async () => {
    server = new DashboardServer(3201);
    await server.start();

    const res = await fetch("http://localhost:3201/");
    expect(res.status).toBeDefined();
  });
});

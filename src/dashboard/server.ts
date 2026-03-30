import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, writeFileSync, existsSync, watch, type FSWatcher } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { WebSocketBroadcaster } from "./socket.js";
import type { HarnessEvent } from "../core/types.js";

const EVENTS_FILE = "events.json";

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
  private eventLog: HarnessEvent[] = [];

  constructor(port = 3117, projectRoot?: string) {
    this.port = port;
    this.projectRoot = projectRoot ?? null;
    this.loadEventLog();
    this.server = createServer(this.handleRequest.bind(this));
    this.broadcaster = new WebSocketBroadcaster(
      this.server,
      () => this.buildSnapshot(),
    );
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

  private getEventsFilePath(): string | null {
    if (!this.projectRoot) return null;
    return join(this.projectRoot, ".harness", EVENTS_FILE);
  }

  private loadEventLog(): void {
    const filePath = this.getEventsFilePath();
    if (!filePath || !existsSync(filePath)) return;
    try {
      this.eventLog = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch { /* ignore corrupt file */ }
  }

  private persistEventLog(): void {
    const filePath = this.getEventsFilePath();
    if (!filePath) return;
    try {
      writeFileSync(filePath, JSON.stringify(this.eventLog), "utf-8");
    } catch { /* ignore write errors */ }
  }

  private buildSnapshot(): HarnessEvent | null {
    if (!this.projectRoot) return null;
    const harnessDir = join(this.projectRoot, ".harness");
    if (!existsSync(harnessDir)) return null;

    const files: Record<string, string | null> = {};
    for (const name of ALLOWED_FILES) {
      const filePath = join(harnessDir, name);
      files[name] = existsSync(filePath) ? readFileSync(filePath, "utf-8") : null;
    }

    let progress = null;
    const progressPath = join(harnessDir, "progress.md");
    if (existsSync(progressPath)) {
      try { progress = parseYaml(readFileSync(progressPath, "utf-8")); } catch { /* ignore */ }
    }

    return { type: "state:snapshot", data: { files, progress, events: this.eventLog } };
  }

  private startFileWatcher(): void {
    if (!this.projectRoot) return;
    const harnessDir = join(this.projectRoot, ".harness");
    if (!existsSync(harnessDir)) return;

    this.fileWatcher = watch(harnessDir, (_eventType, filename) => {
      if (!filename || !ALLOWED_FILES.includes(filename)) return;

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

  isRunning(): boolean {
    return this.running;
  }

  getUrl(): string {
    return `http://localhost:${this.getPort()}`;
  }

  getPort(): number {
    const addr = this.server.address();
    if (addr && typeof addr === "object") return addr.port;
    return this.port;
  }

  broadcast(event: HarnessEvent): void {
    // Persist events that carry state (skip file:update and state:snapshot)
    if (event.type !== "file:update" && event.type !== "state:snapshot") {
      this.eventLog.push(event);
      this.persistEventLog();
    }
    this.broadcaster.broadcast(event);
  }
}

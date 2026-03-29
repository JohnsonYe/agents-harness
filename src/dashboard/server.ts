import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketBroadcaster } from "./socket.js";
import type { HarnessEvent } from "../core/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export class DashboardServer {
  private server: Server;
  private broadcaster: WebSocketBroadcaster;
  private port: number;
  private running = false;

  constructor(port = 3117) {
    this.port = port;
    this.server = createServer(this.handleRequest.bind(this));
    this.broadcaster = new WebSocketBroadcaster(this.server);
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    // Serve the dashboard HTML for any request
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

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, () => {
        this.running = true;
        resolve();
      });
      this.server.on("error", reject);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
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
    return `http://localhost:${this.port}`;
  }

  getPort(): number {
    return this.port;
  }

  broadcast(event: HarnessEvent): void {
    this.broadcaster.broadcast(event);
  }
}

import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import type { HarnessEvent } from "../core/types.js";

export class WebSocketBroadcaster {
  private wss: WebSocketServer;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server });
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

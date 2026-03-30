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

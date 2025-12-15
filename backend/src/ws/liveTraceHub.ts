import { WebSocketServer, WebSocket } from "ws";

export type LiveTraceEvent = {
  type: "iteration" | "final" | "error";
  runId: string;
  payload: any;
  timestamp: number;
};

export class LiveTraceHub {
  private subs = new Map<string, Set<WebSocket>>();
  private history = new Map<string, LiveTraceEvent[]>();
  private maxHistoryEvents = 200;

  constructor(private wss: WebSocketServer) {
    this.wss.on("connection", (ws, req) => {
      const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
      const runId = url.searchParams.get("runId");
      if (runId) this.subscribe(ws, runId);

      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg?.type === "subscribe" && typeof msg.runId === "string") {
            this.subscribe(ws, msg.runId);
          }
        } catch {
          // ignore
        }
      });

      ws.on("close", () => this.unsubscribeAll(ws));
      ws.on("error", () => this.unsubscribeAll(ws));
    });
  }

  subscribe(ws: WebSocket, runId: string) {
    if (!this.subs.has(runId)) this.subs.set(runId, new Set());
    this.subs.get(runId)!.add(ws);

    // replay buffered events for late subscribers
    const events = this.history.get(runId);
    if (events?.length) {
      for (const ev of events) {
        try {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(ev));
        } catch {
          // ignore
        }
      }
    }
  }

  unsubscribeAll(ws: WebSocket) {
    for (const set of this.subs.values()) set.delete(ws);
  }

  publish(runId: string, type: LiveTraceEvent["type"], payload: any) {
    const event: LiveTraceEvent = { type, runId, payload, timestamp: Date.now() };
    const buf = this.history.get(runId) || [];
    buf.push(event);
    if (buf.length > this.maxHistoryEvents) buf.splice(0, buf.length - this.maxHistoryEvents);
    this.history.set(runId, buf);

    const set = this.subs.get(runId);
    if (!set || set.size === 0) return;

    const msg = JSON.stringify(event);
    for (const ws of [...set]) {
      if (ws.readyState !== ws.OPEN) {
        set.delete(ws);
        continue;
      }
      ws.send(msg);
    }
  }

  clear(runId: string) {
    this.history.delete(runId);
    this.subs.delete(runId);
  }
}

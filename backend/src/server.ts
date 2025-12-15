import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";
import { LiveTraceHub } from "./ws/liveTraceHub";
import { llmRequestContextMiddleware } from "./llm/requestContext";
import { askRouter } from "./routes/ask";
import { agentsRouter } from "./routes/agents";
import { logsRouter } from "./routes/logs";
import { configRouter } from "./routes/config";
import { memoryRouter } from "./routes/memory";
import { promptsRouter } from "./routes/prompts";
import { runsRouter } from "./routes/runs";
import { docsRouter } from "./routes/docs";
import { adminRouter } from "./routes/admin";
import { workflowsRouter } from "./routes/workflows";
import { AgentStore } from "./core/agentStore";
import { ConfigStore } from "./core/configStore";
import { PromptStore } from "./core/promptStore";
import { MemoryStore } from "./core/memoryStore";
import { RunStore } from "./core/runStore";
import { DocStore } from "./core/docStore";
import { WorkflowStore } from "./core/workflowStore";
import { log } from "./utils/logger";

const app = express();
if (process.env.TRUST_PROXY) {
  const v = process.env.TRUST_PROXY.trim();
  // common patterns: "1" / "true" / "loopback"
  app.set("trust proxy", v === "true" ? true : v === "loopback" ? "loopback" : Number.isFinite(Number(v)) ? Number(v) : true);
}

const allowedOrigins = (() => {
  const raw = (process.env.CORS_ORIGINS || "").trim();
  if (!raw) return null;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
})();

app.use(
  cors({
    origin(origin, cb) {
      // non-browser / same-origin
      if (!origin) return cb(null, true);
      if (!allowedOrigins) {
        // default open in dev, default closed in prod unless configured
        if ((process.env.NODE_ENV || "").toLowerCase() === "production") return cb(null, false);
        return cb(null, true);
      }
      return cb(null, allowedOrigins.includes(origin));
    },
  })
);
app.use(express.json({ limit: "1mb" }));

// attach request-scoped LLM overrides (provider/api key/base url)
app.use(llmRequestContextMiddleware);

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const liveTraceHub = new LiveTraceHub(wss);

app.get("/healthz", (_req, res) => res.json({ ok: true }));

const agentStore = new AgentStore();
const configStore = new ConfigStore();
const promptStore = new PromptStore();
const memoryStore = new MemoryStore();
const runStore = new RunStore();
const docStore = new DocStore();
const workflowStore = new WorkflowStore();

app.use("/api", askRouter(agentStore, configStore, promptStore, memoryStore, runStore, liveTraceHub, workflowStore));
app.use("/api", adminRouter());
app.use("/api", agentsRouter(agentStore, promptStore));
app.use("/api", logsRouter(runStore, agentStore, configStore, promptStore, memoryStore));
app.use("/api", configRouter(configStore));
app.use("/api", memoryRouter(memoryStore));
app.use("/api", promptsRouter(promptStore));
app.use("/api", runsRouter());
app.use("/api", docsRouter(docStore));
app.use("/api", workflowsRouter(workflowStore, agentStore, configStore, promptStore));

app.use((err: any, req: any, res: any, next: any) => {
  log("Unhandled error", err);
  res.status(500).json({ error: "internal" });
});

const port = process.env.PORT || 3001;
server.listen(port, () => log(`Backend listening on ${port}`));

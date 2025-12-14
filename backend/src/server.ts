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
import { AgentStore } from "./core/agentStore";
import { ConfigStore } from "./core/configStore";
import { PromptStore } from "./core/promptStore";
import { MemoryStore } from "./core/memoryStore";
import { RunStore } from "./core/runStore";
import { log } from "./utils/logger";

const app = express();
app.use(cors());
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

app.use("/api", askRouter(agentStore, configStore, promptStore, memoryStore, runStore, liveTraceHub));
app.use("/api", agentsRouter(agentStore));
app.use("/api", logsRouter(runStore, agentStore, configStore, promptStore, memoryStore));
app.use("/api", configRouter(configStore));
app.use("/api", memoryRouter(memoryStore));
app.use("/api", promptsRouter(promptStore));

app.use((err: any, req: any, res: any, next: any) => {
  log("Unhandled error", err);
  res.status(500).json({ error: "internal" });
});

const port = process.env.PORT || 3001;
server.listen(port, () => log(`Backend listening on ${port}`));
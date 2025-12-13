import express from "express";
import cors from "cors";
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

const agentStore = new AgentStore();
const configStore = new ConfigStore();
const promptStore = new PromptStore();
const memoryStore = new MemoryStore();
const runStore = new RunStore();

app.use("/api", askRouter(agentStore, configStore, promptStore, memoryStore, runStore));
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
app.listen(port, () => log(`Backend listening on ${port}`));

import fs from "fs";
import path from "path";
import { ConfigShape } from "./types";
import { atomicWrite } from "../utils/atomicWrite";
import { withFileLock } from "../utils/fileLock";

const configPath = path.join(__dirname, "../../memory/config.json");

export class ConfigStore {
  private config: ConfigShape;
  constructor() {
    this.config = this.load();
  }

  private load(): ConfigShape {
    const defaults: ConfigShape = {
      provider_rates: { default: { input: 0.000001, output: 0.000001, reasoning: 0.000001 } },
      default_provider: "",
      llm_providers: {},
      maxIterations: 5,
      maxTokens: 2048,
      workflow_designer: {
        provider: "",
        model: "",
        systemPrompt:
          "You are an expert workflow designer for a multi-agent LLM system. " +
          "Design minimal, practical DAG workflows. Output strictly valid JSON only, matching the requested schema.",
      },
    };

    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<ConfigShape>;
      // lightweight migration: ensure llm_providers exists
      const merged: ConfigShape = {
        ...defaults,
        ...parsed,
        provider_rates: { ...defaults.provider_rates, ...(parsed.provider_rates || {}) },
        llm_providers: { ...(parsed.llm_providers || {}) },
        workflow_designer: { ...defaults.workflow_designer, ...(parsed.workflow_designer || {}) },
      };

      // If config on disk is missing new fields, persist migrated shape.
      if (!parsed.llm_providers || !parsed.workflow_designer || typeof parsed.default_provider !== "string") {
        try {
          fs.mkdirSync(path.dirname(configPath), { recursive: true });
          fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));
        } catch {
          // ignore
        }
      }

      return merged;
    } catch {
      return defaults;
    }
  }

  getConfig() {
    return this.config;
  }

  async update(newConfig: Partial<ConfigShape>) {
    await withFileLock(configPath, async () => {
      this.config = { ...this.config, ...newConfig };
      await atomicWrite(configPath, JSON.stringify(this.config, null, 2));
    });
    return this.config;
  }
}

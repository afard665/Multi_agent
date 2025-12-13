import fs from "fs";
import path from "path";
import { ConfigShape } from "./types";
import { atomicWrite } from "../utils/atomicWrite";

const configPath = path.join(__dirname, "../../memory/config.json");

export class ConfigStore {
  private config: ConfigShape;
  constructor() {
    this.config = this.load();
  }

  private load(): ConfigShape {
    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return { provider_rates: { default: { input: 0.000001, output: 0.000001, reasoning: 0.000001 } }, maxIterations: 5, maxTokens: 2048 };
    }
  }

  getConfig() {
    return this.config;
  }

  async update(newConfig: Partial<ConfigShape>) {
    this.config = { ...this.config, ...newConfig };
    await atomicWrite(configPath, JSON.stringify(this.config, null, 2));
    return this.config;
  }
}

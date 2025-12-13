import { ConfigShape } from "../core/types";

export function selectProvider(config: ConfigShape, objective: "min_cost" | "max_accuracy" | "balanced" = "min_cost"): string {
  const providers = Object.keys(config.provider_rates || {});
  if (providers.length === 0) return "default";

  const ranked = providers
    .map((p) => {
      const rate = config.provider_rates[p];
      const estimated = (rate.input + rate.output + rate.reasoning) || 0;
      return { provider: p, estimated };
    })
    .sort((a, b) => a.estimated - b.estimated);

  if (objective === "max_accuracy") {
    return ranked[ranked.length - 1]?.provider || ranked[0].provider;
  }

  if (objective === "balanced") {
    const midIndex = Math.floor(ranked.length / 2);
    return ranked[midIndex]?.provider || ranked[0].provider;
  }

  return ranked[0].provider;
}

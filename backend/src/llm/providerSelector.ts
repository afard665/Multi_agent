import { ConfigShape } from "../core/types";

export function selectProvider(config: ConfigShape): string {
  const providerRegistryKeys = Object.keys(config.llm_providers || {});
  const rateKeys = Object.keys(config.provider_rates || {});

  // Prefer saved providers if available; otherwise fall back to rate keys.
  const candidates = providerRegistryKeys.length ? providerRegistryKeys : rateKeys;

  if (!candidates.length) return "default";

  let cheapest = candidates[0];
  let cheapestCost = Number.MAX_VALUE;

  candidates.forEach((p) => {
    const rate = (config.provider_rates || {})[p] || (config.provider_rates || {}).default;
    const estimated = rate ? (rate.input + rate.output + rate.reasoning) || 0 : 0;
    if (estimated < cheapestCost) {
      cheapest = p;
      cheapestCost = estimated;
    }
  });

  return cheapest || "default";
}
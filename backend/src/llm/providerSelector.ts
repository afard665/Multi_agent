import { ConfigShape } from "../core/types";

export function selectProvider(config: ConfigShape): string {
  const providers = Object.keys(config.provider_rates || {});
  let cheapest = providers[0] || "default";
  let cheapestCost = Number.MAX_VALUE;
  providers.forEach((p) => {
    const rate = config.provider_rates[p];
    const estimated = (rate.input + rate.output + rate.reasoning) || 0;
    if (estimated < cheapestCost) {
      cheapest = p;
      cheapestCost = estimated;
    }
  });
  return cheapest;
}

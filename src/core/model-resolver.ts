import { ProxyError } from "../errors.js";
import type { ModelRoute, RouteTarget } from "../types.js";
import type { ModelRepository } from "./contracts.js";

export class ModelResolver {
  constructor(private readonly models: ModelRepository) {}

  resolveRequired(modelKey: string, capability: "chat" | "embeddings"): RouteTarget[] {
    const route = this.models.get(modelKey);
    if (!route) {
      throw new ProxyError(`Unknown model: ${modelKey}`, {
        statusCode: 404,
        code: "unknown_model"
      });
    }

    if (!route.capabilities.includes(capability)) {
      throw new ProxyError(`Model does not support ${capability}: ${modelKey}`, {
        statusCode: 400,
        code: "unsupported_capability"
      });
    }

    return orderedTargets(modelKey, route);
  }
}

export function orderedTargets(modelKey: string, route: ModelRoute): RouteTarget[] {
  return route.providers.map((entry) => ({
    provider: entry.provider,
    model: entry.model ?? modelKey
  }));
}
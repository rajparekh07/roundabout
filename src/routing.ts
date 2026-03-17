import { ProxyError } from "./errors.js";
import type { AliasRoute, RoundaboutConfig } from "./types.js";

export function resolveAlias(config: RoundaboutConfig, alias: string, capability: "chat" | "embeddings") {
  const route = config.aliases[alias];
  if (!route) {
    throw new ProxyError(`Unknown model alias: ${alias}`, {
      statusCode: 404,
      code: "unknown_model"
    });
  }

  if (!route.capabilities.includes(capability)) {
    throw new ProxyError(`Model alias does not support ${capability}: ${alias}`, {
      statusCode: 400,
      code: "unsupported_capability"
    });
  }

  return route;
}

export function orderedTargets(route: AliasRoute) {
  return [route.primary, ...route.fallbacks];
}

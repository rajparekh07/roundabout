import { ProxyError } from "../errors.js";
import type { AliasRoute, ProviderKind, RouteTarget } from "../types.js";
import type { AliasRepository } from "./contracts.js";

export class AliasResolver {
  constructor(private readonly aliases: AliasRepository) {}

  resolveRequired(alias: string, capability: "chat" | "embeddings") {
    const route = this.aliases.get(alias);
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

  resolveAnthropicModel(model: string, capability: "chat" | "embeddings") {
    const route = this.aliases.get(model);
    if (!route) {
      return {
        kind: "direct" as const,
        provider: "anthropic" as ProviderKind,
        model
      };
    }

    if (!route.capabilities.includes(capability)) {
      throw new ProxyError(`Model alias does not support ${capability}: ${model}`, {
        statusCode: 400,
        code: "unsupported_capability"
      });
    }

    return {
      kind: "alias" as const,
      targets: orderedTargets(route)
    };
  }
}

function orderedTargets(route: AliasRoute): RouteTarget[] {
  return [route.primary, ...route.fallbacks];
}

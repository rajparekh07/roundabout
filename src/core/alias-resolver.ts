import { ProxyError } from "../errors.js";
import type { ProviderDescriptorRegistry } from "../providers/provider-descriptor.js";
import type { AliasRoute, ProviderCapability, ProviderName, ProviderSettings, RouteTarget } from "../types.js";
import type { AliasRepository } from "./contracts.js";

export class AliasResolver {
  constructor(
    private readonly aliases: AliasRepository,
    private readonly providers: Record<ProviderName, ProviderSettings>,
    private readonly descriptorRegistry: ProviderDescriptorRegistry
  ) {}

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
        provider: this.resolveDirectProvider("anthropic-native"),
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

  private resolveDirectProvider(capability: ProviderCapability): ProviderName {
    const matchingProviders = Object.entries(this.providers).filter(([name, settings]) => {
      if (!settings.enabled) {
        return false;
      }
      const descriptor = this.descriptorRegistry.resolve(name, settings.protocol);
      return descriptor.capabilities.has(capability);
    });

    const preferred = matchingProviders.find(([provider]) => provider === "anthropic");
    if (preferred) {
      return preferred[0];
    }

    if (matchingProviders.length === 1) {
      return matchingProviders[0][0];
    }

    if (matchingProviders.length === 0) {
      throw new ProxyError(`No enabled provider with "${capability}" capability configured`, {
        statusCode: 400,
        code: "provider_disabled"
      });
    }

    throw new ProxyError(`Multiple enabled providers with "${capability}" capability are configured; use an alias`, {
      statusCode: 400,
      code: "provider_ambiguous"
    });
  }
}

function orderedTargets(route: AliasRoute): RouteTarget[] {
  return [route.primary, ...route.fallbacks];
}

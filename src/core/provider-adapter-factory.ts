import { ProxyError } from "../errors.js";
import { AnthropicAdapter } from "../providers/anthropic.js";
import type { FetchLike, ProviderAdapter } from "../providers/base.js";
import { OpenAiAdapter } from "../providers/openai.js";
import { OpenRouterAdapter } from "../providers/openrouter.js";
import type { ProviderKind, ProviderSettings, RoundaboutConfig } from "../types.js";
import type { ProviderAdapterFactory } from "./contracts.js";

export class DefaultProviderAdapterFactory implements ProviderAdapterFactory {
  constructor(
    private readonly config: RoundaboutConfig,
    private readonly fetcher?: FetchLike
  ) {}

  create(provider: ProviderKind): ProviderAdapter {
    const settings = this.config.providers[provider];
    if (!settings?.enabled) {
      throw new ProxyError(`Provider is not enabled: ${provider}`, {
        statusCode: 400,
        code: "provider_disabled"
      });
    }

    return buildAdapter(provider, settings, this.fetcher);
  }
}

function buildAdapter(provider: ProviderKind, settings: ProviderSettings, fetcher?: FetchLike): ProviderAdapter {
  switch (provider) {
    case "openai":
      return new OpenAiAdapter(settings, fetcher);
    case "anthropic":
      return new AnthropicAdapter(settings, fetcher);
    case "openrouter":
      return new OpenRouterAdapter(settings, fetcher);
  }
}

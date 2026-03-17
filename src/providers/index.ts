import { ProxyError } from "../errors.js";
import type { ProviderSettings, RoundaboutConfig } from "../types.js";
import { AnthropicAdapter } from "./anthropic.js";
import type { FetchLike, ProviderAdapter } from "./base.js";
import { OpenAiAdapter } from "./openai.js";
import { OpenRouterAdapter } from "./openrouter.js";

export function createAdapter(
  config: RoundaboutConfig,
  provider: "openai" | "anthropic" | "openrouter",
  fetcher?: FetchLike
): ProviderAdapter {
  const settings = config.providers[provider];
  if (!settings?.enabled) {
    throw new ProxyError(`Provider is not enabled: ${provider}`, {
      statusCode: 400,
      code: "provider_disabled"
    });
  }

  return buildAdapter(provider, settings, fetcher);
}

function buildAdapter(provider: "openai" | "anthropic" | "openrouter", settings: ProviderSettings, fetcher?: FetchLike) {
  switch (provider) {
    case "openai":
      return new OpenAiAdapter(settings, fetcher);
    case "anthropic":
      return new AnthropicAdapter(settings, fetcher);
    case "openrouter":
      return new OpenRouterAdapter(settings, fetcher);
  }
}

import type { ProviderDescriptor } from "./provider-descriptor.js";
import { ProviderDescriptorRegistry } from "./provider-descriptor.js";
import { OpenAiAdapter } from "./openai.js";
import { AnthropicAdapter } from "./anthropic.js";

export const openaiDescriptor: ProviderDescriptor = {
  name: "openai",
  label: "OpenAI",
  capabilities: new Set(["chat", "embeddings"]),
  defaultBaseUrl: "https://api.openai.com/v1",
  createAdapter: (settings, fetcher) => new OpenAiAdapter(settings, fetcher)
};

export const anthropicDescriptor: ProviderDescriptor = {
  name: "anthropic",
  label: "Anthropic",
  capabilities: new Set(["chat", "anthropic-native"]),
  defaultBaseUrl: "https://api.anthropic.com/v1",
  createAdapter: (settings, fetcher) => new AnthropicAdapter(settings, fetcher)
};

export const openrouterDescriptor: ProviderDescriptor = {
  name: "openrouter",
  label: "OpenRouter",
  capabilities: new Set(["chat", "embeddings"]),
  defaultBaseUrl: "https://openrouter.ai/api/v1",
  createAdapter: (settings, fetcher) =>
    new OpenAiAdapter(
      { ...settings, baseUrl: settings.baseUrl ?? "https://openrouter.ai/api/v1" },
      fetcher
    )
};

export function createDefaultRegistry(): ProviderDescriptorRegistry {
  const registry = new ProviderDescriptorRegistry();
  registry.register(openaiDescriptor);
  registry.register(anthropicDescriptor);
  registry.register(openrouterDescriptor);
  return registry;
}

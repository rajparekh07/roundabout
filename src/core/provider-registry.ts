import { ProxyError } from "../errors.js";
import { AnthropicAdapter } from "../providers/anthropic.js";
import type { ProviderKind } from "../types.js";
import type {
  AnthropicGateway,
  ChatGateway,
  EmbeddingGateway,
  ProviderAdapterFactory
} from "./contracts.js";

export class ProviderRegistry {
  constructor(private readonly factory: ProviderAdapterFactory) {}

  getChatGateway(provider: ProviderKind): ChatGateway {
    return this.factory.create(provider);
  }

  getEmbeddingGateway(provider: ProviderKind): EmbeddingGateway {
    return this.factory.create(provider);
  }

  getAnthropicGateway(provider: ProviderKind): AnthropicGateway {
    const adapter = this.factory.create(provider);
    if (adapter instanceof AnthropicAdapter) {
      return adapter;
    }

    throw new ProxyError(`Provider does not support Anthropic-native flows: ${provider}`, {
      statusCode: 400,
      code: "provider_unsupported_capability"
    });
  }
}

import { ProxyError } from "../errors.js";
import type { AnthropicNativeAdapter, ChatAdapter } from "../providers/base.js";
import type { ProviderDescriptorRegistry } from "../providers/provider-descriptor.js";
import type { ProviderName, RoundaboutConfig } from "../types.js";
import type {
  AnthropicGateway,
  ChatGateway,
  EmbeddingGateway,
  ProviderAdapterFactory
} from "./contracts.js";

export class ProviderRegistry {
  constructor(
    private readonly factory: ProviderAdapterFactory,
    private readonly descriptorRegistry: ProviderDescriptorRegistry,
    private readonly config: RoundaboutConfig
  ) {}

  getChatGateway(provider: ProviderName): ChatGateway {
    return this.factory.create(provider);
  }

  getEmbeddingGateway(provider: ProviderName): EmbeddingGateway {
    return this.factory.create(provider) as ChatAdapter & EmbeddingGateway;
  }

  supportsAnthropicNative(provider: ProviderName): boolean {
    const settings = this.config.providers[provider];
    if (!settings) {
      return false;
    }
    return this.descriptorRegistry
      .resolve(provider, settings.protocol)
      .capabilities.has("anthropic-native");
  }

  getAnthropicGateway(provider: ProviderName): AnthropicGateway {
    if (!this.supportsAnthropicNative(provider)) {
      throw new ProxyError(`Provider does not support Anthropic-native flows: ${provider}`, {
        statusCode: 400,
        code: "provider_unsupported_capability"
      });
    }

    return this.factory.create(provider) as ChatAdapter & AnthropicNativeAdapter;
  }
}

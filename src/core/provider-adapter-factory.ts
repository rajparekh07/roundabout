import { ProxyError } from "../errors.js";
import type { ChatAdapter, FetchLike } from "../providers/base.js";
import type { ProviderDescriptorRegistry } from "../providers/provider-descriptor.js";
import type { ProviderName, RoundaboutConfig } from "../types.js";
import type { ProviderAdapterFactory } from "./contracts.js";

export class DefaultProviderAdapterFactory implements ProviderAdapterFactory {
  constructor(
    private readonly config: RoundaboutConfig,
    private readonly registry: ProviderDescriptorRegistry,
    private readonly fetcher?: FetchLike
  ) {}

  create(provider: ProviderName): ChatAdapter {
    const settings = this.config.providers[provider];
    if (!settings?.enabled) {
      throw new ProxyError(`Provider is not enabled: ${provider}`, {
        statusCode: 400,
        code: "provider_disabled"
      });
    }

    const descriptor = this.registry.resolve(provider, settings.protocol);
    const resolvedSettings = {
      ...settings,
      baseUrl: settings.baseUrl ?? descriptor.defaultBaseUrl
    };
    return descriptor.createAdapter(resolvedSettings, this.fetcher);
  }
}

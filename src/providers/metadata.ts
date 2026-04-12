import type { ProviderDescriptorRegistry } from "./providers/provider-descriptor.js";

export function getProviderLabel(registry: ProviderDescriptorRegistry, provider: string): string {
  return registry.get(provider)?.label ?? provider;
}

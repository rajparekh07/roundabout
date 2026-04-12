import { ProxyError } from "../errors.js";
import type { ProviderCapability, ProviderProtocol, ProviderSettings } from "../types.js";
import type { ChatAdapter, FetchLike } from "./base.js";

export interface ProviderDescriptor {
  readonly name: string;
  readonly label: string;
  readonly capabilities: ReadonlySet<ProviderCapability>;
  readonly defaultBaseUrl?: string;
  createAdapter(settings: ProviderSettings, fetcher?: FetchLike): ChatAdapter;
}

export class ProviderDescriptorRegistry {
  private readonly descriptors = new Map<string, ProviderDescriptor>();

  register(descriptor: ProviderDescriptor): void {
    this.descriptors.set(descriptor.name, descriptor);
  }

  get(name: string): ProviderDescriptor | undefined {
    return this.descriptors.get(name);
  }

  getRequired(name: string): ProviderDescriptor {
    const descriptor = this.descriptors.get(name);
    if (!descriptor) {
      throw new ProxyError(`Unknown provider: ${name}`, {
        statusCode: 400,
        code: "unknown_provider"
      });
    }
    return descriptor;
  }

  list(capability?: ProviderCapability): ProviderDescriptor[] {
    const all = [...this.descriptors.values()];
    return capability ? all.filter((d) => d.capabilities.has(capability)) : all;
  }

  /**
   * Resolve a descriptor for a provider name.
   * First tries an exact name match (for builtins or pre-registered custom providers),
   * then falls back to the descriptor matching the given protocol.
   */
  resolve(name: string, protocol: ProviderProtocol): ProviderDescriptor {
    const exact = this.descriptors.get(name);
    if (exact) {
      return exact;
    }

    const byProtocol = this.descriptors.get(protocol);
    if (byProtocol) {
      return byProtocol;
    }

    throw new ProxyError(`No descriptor found for provider "${name}" with protocol "${protocol}"`, {
      statusCode: 400,
      code: "unknown_provider"
    });
  }
}

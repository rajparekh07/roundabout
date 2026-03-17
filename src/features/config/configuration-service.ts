import { summarizeProviders, upsertAlias, upsertProvider, upsertToken } from "../../config.js";
import type { ConfigRepository } from "../../core/contracts.js";
import type { AliasRoute, ProviderKind, ProviderSettings, RoundaboutConfig } from "../../types.js";

export class ConfigurationService {
  constructor(private readonly repository: ConfigRepository) {}

  load() {
    return this.repository.load();
  }

  save(config: RoundaboutConfig) {
    return this.repository.save(config);
  }

  getPath() {
    return this.repository.getPath();
  }

  summarizeProviders(config: RoundaboutConfig) {
    return summarizeProviders(config);
  }

  setProvider(config: RoundaboutConfig, provider: ProviderKind, settings: ProviderSettings) {
    upsertProvider(config, provider, settings);
  }

  setAlias(config: RoundaboutConfig, alias: string, route: AliasRoute) {
    upsertAlias(config, alias, route);
  }

  setToken(config: RoundaboutConfig, project: string, token: string) {
    upsertToken(config, project, token);
  }
}

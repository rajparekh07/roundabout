import { summarizeProviders, upsertModel, upsertProvider, upsertToken } from "../../config.js";
import type { ConfigRepository } from "../../core/contracts.js";
import type { ModelRoute, ProviderName, ProviderSettings, RoundaboutConfig } from "../../types.js";

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

  setProvider(config: RoundaboutConfig, provider: ProviderName, settings: ProviderSettings) {
    upsertProvider(config, provider, settings);
  }

  setModel(config: RoundaboutConfig, modelKey: string, route: ModelRoute) {
    upsertModel(config, modelKey, route);
  }

  setToken(config: RoundaboutConfig, project: string, token: string) {
    upsertToken(config, project, token);
  }
}
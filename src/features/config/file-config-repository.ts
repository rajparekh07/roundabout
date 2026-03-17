import { getConfigPath, loadConfig, saveConfig } from "../../config.js";
import type { ConfigRepository } from "../../core/contracts.js";
import type { RoundaboutConfig } from "../../types.js";

export class FileConfigRepository implements ConfigRepository {
  constructor(private readonly configPath = getConfigPath()) {}

  getPath() {
    return this.configPath;
  }

  load(): Promise<RoundaboutConfig> {
    return loadConfig(this.configPath);
  }

  save(config: RoundaboutConfig) {
    return saveConfig(config, this.configPath);
  }
}

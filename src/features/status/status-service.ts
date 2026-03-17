import type { ConfigRepository } from "../../core/contracts.js";
import { summarizeProviders } from "../../config.js";

export class StatusService {
  constructor(private readonly repository: ConfigRepository) {}

  async summary() {
    const config = await this.repository.load();
    return {
      configPath: this.repository.getPath(),
      daemon: `http://${config.daemon.host}:${config.daemon.port}`,
      providers: summarizeProviders(config),
      aliasCount: Object.keys(config.aliases).length,
      tokenCount: Object.keys(config.tokens).length,
      health: await this.checkHealth(config.daemon.host, config.daemon.port)
    };
  }

  private async checkHealth(host: string, port: number) {
    try {
      const response = await fetch(`http://${host}:${port}/healthz`);
      if (!response.ok) {
        return "unreachable";
      }
      const body = (await response.json()) as { ok?: boolean };
      return body.ok ? "running" : "unreachable";
    } catch {
      return "not running";
    }
  }
}

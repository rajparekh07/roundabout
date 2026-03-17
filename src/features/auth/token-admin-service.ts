import { generateToken } from "../../token.js";
import type { ConfigRepository } from "../../core/contracts.js";

export class TokenAdminService {
  constructor(private readonly repository: ConfigRepository) {}

  async create(project: string) {
    const config = await this.repository.load();
    const value = generateToken();
    const now = new Date().toISOString();
    const current = config.tokens[project];
    config.tokens[project] = {
      token: value,
      createdAt: current?.createdAt ?? now,
      updatedAt: now
    };
    await this.repository.save(config);
    return value;
  }

  async rotate(project: string) {
    return this.create(project);
  }

  async list() {
    const config = await this.repository.load();
    return Object.entries(config.tokens).map(([project, tokenEntry]) => ({
      project,
      updatedAt: tokenEntry.updatedAt,
      tokenPreview: `${tokenEntry.token.slice(0, 10)}...`
    }));
  }
}

import type { ModelRoute, RoundaboutConfig } from "../types.js";
import type { ModelRepository, TokenRepository } from "./contracts.js";

export class InMemoryModelRepository implements ModelRepository {
  constructor(private readonly models: Record<string, ModelRoute>) {}

  get(modelKey: string) {
    return this.models[modelKey];
  }

  list() {
    return this.models;
  }
}

export class InMemoryTokenRepository implements TokenRepository {
  constructor(private readonly config: RoundaboutConfig) {}

  findProjectByToken(token: string) {
    const entry = Object.entries(this.config.tokens).find(([, current]) => current.token === token);
    return entry?.[0] ?? null;
  }

  list() {
    return this.config.tokens;
  }
}
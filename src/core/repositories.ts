import type { AliasRoute, RoundaboutConfig } from "../types.js";
import type { AliasRepository, TokenRepository } from "./contracts.js";

export class InMemoryAliasRepository implements AliasRepository {
  constructor(private readonly aliases: Record<string, AliasRoute>) {}

  get(alias: string) {
    return this.aliases[alias];
  }

  list() {
    return this.aliases;
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

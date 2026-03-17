import { describe, expect, it } from "vitest";

import { AliasResolver } from "../src/core/alias-resolver.js";
import { FallbackExecutor } from "../src/core/fallback-executor.js";
import { InMemoryAliasRepository, InMemoryTokenRepository } from "../src/core/repositories.js";
import { ProxyError } from "../src/errors.js";
import { TokenAuthService } from "../src/features/auth/token-auth-service.js";
import type { RoundaboutConfig } from "../src/types.js";

const config: RoundaboutConfig = {
  daemon: { host: "127.0.0.1", port: 4317 },
  providers: {},
  aliases: {
    smart: {
      primary: { provider: "openai", model: "gpt-primary" },
      fallbacks: [{ provider: "openrouter", model: "gpt-fallback" }],
      capabilities: ["chat"]
    },
    embed: {
      primary: { provider: "openai", model: "text-embedding-3-small" },
      fallbacks: [],
      capabilities: ["embeddings"]
    }
  },
  tokens: {
    app: {
      token: "rb_secret",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z"
    }
  }
};

describe("architecture services", () => {
  it("resolves aliases and raw anthropic models explicitly", () => {
    const resolver = new AliasResolver(new InMemoryAliasRepository(config.aliases));

    expect(resolver.resolveRequired("smart", "chat").primary.model).toBe("gpt-primary");
    expect(resolver.resolveAnthropicModel("smart", "chat")).toEqual({
      kind: "alias",
      targets: [
        { provider: "openai", model: "gpt-primary" },
        { provider: "openrouter", model: "gpt-fallback" }
      ]
    });
    expect(resolver.resolveAnthropicModel("claude-opus-4-1", "chat")).toEqual({
      kind: "direct",
      provider: "anthropic",
      model: "claude-opus-4-1"
    });
  });

  it("throws readable alias errors for unknown models and capability mismatches", () => {
    const resolver = new AliasResolver(new InMemoryAliasRepository(config.aliases));

    expect(() => resolver.resolveRequired("missing", "chat")).toThrowError(/Unknown model alias/);
    expect(() => resolver.resolveRequired("embed", "chat")).toThrowError(/does not support chat/);
  });

  it("retries retriable failures but stops on non-retriable failures", async () => {
    const executor = new FallbackExecutor();
    const targets = [
      { provider: "openai" as const, model: "primary" },
      { provider: "openrouter" as const, model: "fallback" }
    ];

    const result = await executor.execute(targets, async (target) => {
      if (target.model === "primary") {
        throw new ProxyError("rate limited", {
          statusCode: 429,
          code: "rate_limit",
          retriable: true
        });
      }
      return "ok";
    });

    expect(result).toBe("ok");

    await expect(
      executor.execute(targets, async () => {
        throw new ProxyError("bad request", {
          statusCode: 400,
          code: "bad_request"
        });
      })
    ).rejects.toMatchObject({ code: "bad_request" });
  });

  it("authenticates bearer and x-api-key tokens through the repository abstraction", () => {
    const auth = new TokenAuthService(new InMemoryTokenRepository(config));

    expect(auth.validate({ authorization: "Bearer rb_secret" })).toEqual({ project: "app" });
    expect(auth.validate({ "x-api-key": "rb_secret" })).toEqual({ project: "app" });
    expect(auth.validate({ authorization: "Bearer missing" })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import { ModelResolver } from "../src/core/model-resolver.js";
import { orderedTargets } from "../src/core/model-resolver.js";
import { FallbackExecutor } from "../src/core/fallback-executor.js";
import { InMemoryModelRepository, InMemoryTokenRepository } from "../src/core/repositories.js";
import { ProxyError } from "../src/errors.js";
import { TokenAuthService } from "../src/features/auth/token-auth-service.js";
import type { RoundaboutConfig } from "../src/types.js";

const config: RoundaboutConfig = {
  daemon: { host: "127.0.0.1", port: 4317 },
  providers: {
    anthropic: {
      enabled: true,
      protocol: "anthropic",
      apiKey: "sk-anthropic",
      baseUrl: "https://anthropic.test/v1"
    }
  },
  models: {
    smart: {
      providers: [
        { provider: "openai", model: "gpt-primary" },
        { provider: "openrouter", model: "gpt-fallback" }
      ],
      capabilities: ["chat"]
    },
    embed: {
      providers: [{ provider: "openai", model: "text-embedding-3-small" }],
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
  it("resolves models with ordered provider targets", () => {
    const resolver = new ModelResolver(new InMemoryModelRepository(config.models));

    const targets = resolver.resolveRequired("smart", "chat");
    expect(targets).toEqual([
      { provider: "openai", model: "gpt-primary" },
      { provider: "openrouter", model: "gpt-fallback" }
    ]);
  });

  it("throws readable model errors for unknown models and capability mismatches", () => {
    const resolver = new ModelResolver(new InMemoryModelRepository(config.models));

    expect(() => resolver.resolveRequired("missing", "chat")).toThrowError(/Unknown model/);
    expect(() => resolver.resolveRequired("embed", "chat")).toThrowError(/does not support chat/);
  });

  it("retries retriable failures but stops on non-retriable failures", async () => {
    const executor = new FallbackExecutor();
    const targets = [
      { provider: "openai", model: "primary" },
      { provider: "openrouter", model: "fallback" }
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

  it("resolves omitted provider model to the parent model key", () => {
    const models = {
      glm54: {
        providers: [
          { provider: "openrouter", model: "openai/gpt-5.4" },
          { provider: "openai" }
        ],
        capabilities: ["chat" as const]
      }
    };
    const resolver = new ModelResolver(new InMemoryModelRepository(models));

    const targets = resolver.resolveRequired("glm54", "chat");
    expect(targets[0]).toEqual({ provider: "openrouter", model: "openai/gpt-5.4" });
    expect(targets[1]).toEqual({ provider: "openai", model: "glm54" });
  });

  it("first provider is attempted before later providers", () => {
    const models = {
      smart: {
        providers: [
          { provider: "openai", model: "gpt-primary" },
          { provider: "openrouter", model: "gpt-fallback" }
        ],
        capabilities: ["chat" as const]
      }
    };
    const resolver = new ModelResolver(new InMemoryModelRepository(models));

    const targets = resolver.resolveRequired("smart", "chat");
    expect(targets[0]?.provider).toBe("openai");
    expect(targets[1]?.provider).toBe("openrouter");
  });
});
import { describe, expect, it, vi } from "vitest";

import { ProxyService } from "../src/service.js";
import type { RoundaboutConfig } from "../src/types.js";
import { jsonResponse } from "./helpers.js";

const baseConfig: RoundaboutConfig = {
  daemon: { host: "127.0.0.1", port: 4317 },
  providers: {
    openai: { enabled: true, apiKey: "sk-openai", baseUrl: "https://openai.test/v1" },
    anthropic: { enabled: true, apiKey: "sk-anthropic", baseUrl: "https://anthropic.test/v1" },
    openrouter: { enabled: true, apiKey: "sk-openrouter", baseUrl: "https://openrouter.test/v1" }
  },
  aliases: {
    smart: {
      primary: { provider: "openai", model: "gpt-primary" },
      fallbacks: [{ provider: "openrouter", model: "gpt-fallback" }],
      capabilities: ["chat"]
    },
    claude: {
      primary: { provider: "anthropic", model: "claude-primary" },
      fallbacks: [],
      capabilities: ["chat"]
    }
  },
  tokens: {}
};

describe("proxy service anthropic surface", () => {
  it("routes alias names on anthropic messages", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        id: "chatcmpl_1",
        object: "chat.completion",
        created: 1,
        model: "gpt-primary",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "hello" },
            finish_reason: "stop"
          }
        ]
      })
    );
    const service = new ProxyService(baseConfig, fetcher);
    const response = await service.messages({
      model: "smart",
      messages: [{ role: "user", content: "hi" }]
    });

    expect(response.type).toBe("message");
    expect(response.content[0]?.text).toBe("hello");
  });

  it("routes raw model names directly to anthropic", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        id: "msg_1",
        type: "message",
        model: "claude-opus-4-1",
        role: "assistant",
        content: [{ type: "text", text: "hello raw" }],
        stop_reason: "end_turn"
      })
    );
    const service = new ProxyService(baseConfig, fetcher);
    const response = await service.messages({
      model: "claude-opus-4-1",
      messages: [{ role: "user", content: "hi" }]
    });

    expect(response.type).toBe("message");
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://anthropic.test/v1/messages");
  });

  it("estimates count_tokens for aliased non-anthropic providers", async () => {
    const service = new ProxyService(baseConfig, vi.fn());
    const response = await service.countTokens({
      model: "smart",
      messages: [{ role: "user", content: "hello from alias route" }]
    });

    expect(response.input_tokens).toBeGreaterThan(0);
  });
});

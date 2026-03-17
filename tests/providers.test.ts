import { describe, expect, it, vi } from "vitest";

import { AnthropicAdapter } from "../src/providers/anthropic.js";
import { OpenAiAdapter } from "../src/providers/openai.js";
import { jsonResponse } from "./helpers.js";

describe("provider adapters", () => {
  it("translates OpenAI chat requests directly", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        id: "chatcmpl_1",
        object: "chat.completion",
        created: 1,
        model: "gpt-4.1-mini",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "hello" },
            finish_reason: "stop"
          }
        ]
      })
    );
    const adapter = new OpenAiAdapter({ enabled: true, apiKey: "sk", baseUrl: "https://openai.test/v1" }, fetcher);
    const response = await adapter.chat(
      {
        model: "smart",
        messages: [{ role: "user", content: "hi" }]
      },
      "gpt-4.1-mini"
    );

    expect(response.choices[0]?.message.content).toBe("hello");
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://openai.test/v1/chat/completions");
  });

  it("maps Anthropic responses into OpenAI chat format", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        id: "msg_1",
        type: "message",
        model: "claude-3-7-sonnet-latest",
        role: "assistant",
        content: [{ type: "text", text: "hello" }],
        usage: { input_tokens: 5, output_tokens: 7 },
        stop_reason: "end_turn"
      })
    );
    const adapter = new AnthropicAdapter(
      { enabled: true, apiKey: "sk", baseUrl: "https://anthropic.test/v1" },
      fetcher
    );
    const response = await adapter.chat(
      {
        model: "smart",
        messages: [{ role: "user", content: "hi" }]
      },
      "claude-3-7-sonnet-latest"
    );

    expect(response.choices[0]?.message.content).toBe("hello");
    expect(response.usage?.total_tokens).toBe(12);
  });

  it("returns native Anthropic messages", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        id: "msg_1",
        type: "message",
        model: "claude-3-7-sonnet-latest",
        role: "assistant",
        content: [{ type: "text", text: "hello" }],
        usage: { input_tokens: 5, output_tokens: 7 },
        stop_reason: "end_turn"
      })
    );
    const adapter = new AnthropicAdapter(
      { enabled: true, apiKey: "sk", baseUrl: "https://anthropic.test/v1" },
      fetcher
    );
    const response = await adapter.messages({
      model: "claude-3-7-sonnet-latest",
      messages: [{ role: "user", content: "hi" }]
    });

    expect(response.type).toBe("message");
    expect(response.content[0]?.text).toBe("hello");
  });

  it("returns native Anthropic count-tokens responses", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        input_tokens: 42
      })
    );
    const adapter = new AnthropicAdapter(
      { enabled: true, apiKey: "sk", baseUrl: "https://anthropic.test/v1" },
      fetcher
    );
    const response = await adapter.countTokens({
      model: "claude-3-7-sonnet-latest",
      messages: [{ role: "user", content: "hi" }]
    });

    expect(response.input_tokens).toBe(42);
  });
});

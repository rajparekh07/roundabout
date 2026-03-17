import { describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createDebugLogger } from "../src/debug.js";
import { createServer } from "../src/server.js";
import type { RoundaboutConfig } from "../src/types.js";
import { jsonResponse } from "./helpers.js";

const config: RoundaboutConfig = {
  daemon: { host: "127.0.0.1", port: 4317 },
  providers: {
    openai: { enabled: true, apiKey: "sk", baseUrl: "https://openai.test/v1" },
    anthropic: { enabled: true, apiKey: "sk-ant", baseUrl: "https://anthropic.test/v1" }
  },
  aliases: {
    smart: {
      primary: { provider: "openai", model: "gpt-4.1-mini" },
      fallbacks: [],
      capabilities: ["chat"]
    },
    claude: {
      primary: { provider: "anthropic", model: "claude-3-7-sonnet-latest" },
      fallbacks: [],
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

describe("server", () => {
  it("rejects invalid tokens", async () => {
    const app = createServer(config, vi.fn());
    await app.ready();

    const response = await request(app.server).post("/v1/chat/completions").send({
      model: "smart",
      messages: [{ role: "user", content: "hi" }]
    });

    expect(response.status).toBe(401);
    await app.close();
  });

  it("serves OpenAI-style embeddings", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        object: "list",
        data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2] }],
        model: "text-embedding-3-small",
        usage: { prompt_tokens: 5, total_tokens: 5 }
      })
    );
    const app = createServer(config, fetcher);
    await app.ready();

    const response = await request(app.server)
      .post("/v1/embeddings")
      .set("authorization", "Bearer rb_secret")
      .send({
        model: "embed",
        input: "hello"
      });

    expect(response.status).toBe(200);
    expect(response.body.model).toBe("embed");
    await app.close();
  });

  it("streams chat completions over SSE", async () => {
    const streamBody = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"id":"chatcmpl_1","object":"chat.completion.chunk","created":1,"model":"gpt-4.1-mini","choices":[{"index":0,"delta":{"content":"hel"},"finish_reason":null}]}\n\n'
          )
        );
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      }
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(streamBody, {
        headers: { "content-type": "text/event-stream" }
      })
    );
    const app = createServer(config, fetcher);
    await app.ready();

    const response = await request(app.server)
      .post("/v1/chat/completions")
      .set("authorization", "Bearer rb_secret")
      .send({
        model: "smart",
        stream: true,
        messages: [{ role: "user", content: "hi" }]
      });

    expect(response.status).toBe(200);
    expect(response.text).toContain("data:");
    expect(response.text).toContain("[DONE]");
    await app.close();
  });

  it("accepts x-api-key on anthropic messages", async () => {
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
    const app = createServer(config, fetcher);
    await app.ready();

    const response = await request(app.server)
      .post("/v1/messages")
      .set("x-api-key", "rb_secret")
      .send({
        model: "claude",
        messages: [{ role: "user", content: "hi" }]
      });

    expect(response.status).toBe(200);
    expect(response.body.type).toBe("message");
    await app.close();
  });

  it("returns anthropic auth errors on anthropic endpoints", async () => {
    const app = createServer(config, vi.fn());
    await app.ready();

    const response = await request(app.server).post("/v1/messages").send({
      model: "claude",
      messages: [{ role: "user", content: "hi" }]
    });

    expect(response.status).toBe(401);
    expect(response.body.type).toBe("error");
    await app.close();
  });

  it("treats anthropic endpoints with query params as anthropic auth failures", async () => {
    const app = createServer(config, vi.fn());
    await app.ready();

    const response = await request(app.server).post("/v1/messages?beta=true").send({
      model: "claude",
      messages: [{ role: "user", content: "hi" }]
    });

    expect(response.status).toBe(401);
    expect(response.body.type).toBe("error");
    await app.close();
  });

  it("supports raw anthropic model names", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        id: "msg_1",
        type: "message",
        model: "claude-opus-4-1",
        role: "assistant",
        content: [{ type: "text", text: "hello raw" }],
        usage: { input_tokens: 5, output_tokens: 7 },
        stop_reason: "end_turn"
      })
    );
    const app = createServer(config, fetcher);
    await app.ready();

    const response = await request(app.server)
      .post("/v1/messages")
      .set("authorization", "Bearer rb_secret")
      .send({
        model: "claude-opus-4-1",
        messages: [{ role: "user", content: "hi" }]
      });

    expect(response.status).toBe(200);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://anthropic.test/v1/messages");
    await app.close();
  });

  it("returns anthropic-shaped responses for aliased openai targets", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        id: "chatcmpl_1",
        object: "chat.completion",
        created: 1,
        model: "gpt-4.1-mini",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "hello alias" },
            finish_reason: "stop"
          }
        ],
        usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 }
      })
    );
    const app = createServer(config, fetcher);
    await app.ready();

    const response = await request(app.server)
      .post("/v1/messages")
      .set("authorization", "Bearer rb_secret")
      .send({
        model: "smart",
        messages: [{ role: "user", content: "hi" }]
      });

    expect(response.status).toBe(200);
    expect(response.body.type).toBe("message");
    expect(response.body.content[0].text).toBe("hello alias");
    await app.close();
  });

  it("supports anthropic count_tokens", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        input_tokens: 42
      })
    );
    const app = createServer(config, fetcher);
    await app.ready();

    const response = await request(app.server)
      .post("/v1/messages/count_tokens")
      .set("x-api-key", "rb_secret")
      .send({
        model: "claude-opus-4-1",
        messages: [{ role: "user", content: "hi" }]
      });

    expect(response.status).toBe(200);
    expect(response.body.input_tokens).toBe(42);
    await app.close();
  });

  it("streams anthropic messages", async () => {
    const streamBody = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'event: message_start\ndata: {"message":{"id":"msg_1","type":"message","role":"assistant","model":"claude","content":[],"stop_reason":null}}\n\n'
          )
        );
        controller.enqueue(
          new TextEncoder().encode(
            'event: content_block_delta\ndata: {"index":0,"delta":{"type":"text_delta","text":"hi"}}\n\n'
          )
        );
        controller.enqueue(
          new TextEncoder().encode(
            'event: message_stop\ndata: {}\n\n'
          )
        );
        controller.close();
      }
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(streamBody, {
        headers: { "content-type": "text/event-stream" }
      })
    );
    const app = createServer(config, fetcher);
    await app.ready();

    const response = await request(app.server)
      .post("/v1/messages")
      .set("x-api-key", "rb_secret")
      .send({
        model: "claude-opus-4-1",
        stream: true,
        messages: [{ role: "user", content: "hi" }]
      });

    expect(response.status).toBe(200);
    expect(response.text).toContain("event: message_start");
    expect(response.text).toContain("event: content_block_delta");
    await app.close();
  });

  it("returns json errors for anthropic stream failures before headers are sent", async () => {
    const brokenConfig: RoundaboutConfig = {
      ...config,
      providers: {
        openai: config.providers.openai
      }
    };
    const app = createServer(brokenConfig, vi.fn());
    await app.ready();

    const response = await request(app.server)
      .post("/v1/messages?beta=true")
      .set("x-api-key", "rb_secret")
      .send({
        model: "claude-opus-4-1",
        stream: true,
        messages: [{ role: "user", content: "hi" }]
      });

    expect(response.status).toBe(400);
    expect(response.body.type).toBe("error");
    expect(response.body.error.message).toContain("Provider is not enabled: anthropic");
    await app.close();
  });

  it("logs request and response bodies in debug mode", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        object: "list",
        data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2] }],
        model: "text-embedding-3-small",
        usage: { prompt_tokens: 5, total_tokens: 5 }
      })
    );
    const stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = createServer(config, fetcher, createDebugLogger(true));
    await app.ready();

    const response = await request(app.server)
      .post("/v1/embeddings")
      .set("authorization", "Bearer rb_secret")
      .send({
        model: "embed",
        input: "hello"
      });

    expect(response.status).toBe(200);
    expect(stderr).toHaveBeenCalled();
    expect(stderr.mock.calls.some((call) => String(call[0]).includes("\"event\":\"request.body\""))).toBe(true);
    expect(stderr.mock.calls.some((call) => String(call[0]).includes("\"event\":\"response.body\""))).toBe(true);
    stderr.mockRestore();
    await app.close();
  });
});

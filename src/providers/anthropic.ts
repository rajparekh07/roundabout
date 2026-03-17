import { randomUUID } from "node:crypto";

import { ProxyError } from "../errors.js";
import type {
  AnthropicCompletionRequest,
  AnthropicCompletionResponse,
  AnthropicCountTokensRequest,
  AnthropicCountTokensResponse,
  AnthropicMessage,
  AnthropicMessageRequest,
  AnthropicMessageResponse,
  AnthropicStreamEvent,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ProviderSettings,
  StreamChunk
} from "../types.js";
import { ensureOk, getFetch } from "./http.js";
import type { FetchLike, ProviderAdapter, ProviderStream } from "./base.js";

const DEFAULT_BASE_URL = "https://api.anthropic.com/v1";

export class AnthropicAdapter implements ProviderAdapter {
  public readonly kind = "anthropic" as const;
  private readonly settings: ProviderSettings;
  private readonly fetcher: FetchLike;

  constructor(settings: ProviderSettings, fetcher?: FetchLike) {
    this.settings = settings;
    this.fetcher = getFetch(fetcher);
  }

  async chat(request: ChatRequest, model: string): Promise<ChatResponse> {
    const payload = toAnthropicPayload(request, model, false);
    const json = await this.messages(payload);
    return fromAnthropicResponse(json, request.model);
  }

  async streamChat(request: ChatRequest, model: string): Promise<ProviderStream> {
    const payload = toAnthropicPayload(request, model, true);
    const response = await this.fetcher(`${this.baseUrl()}/messages`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload)
    });
    await ensureOk(response);
    const body = response.body;
    if (!body) {
      throw new ProxyError("Provider did not return a stream body", {
        statusCode: 502,
        code: "provider_stream_missing",
        retriable: true
      });
    }

    return {
      async *[Symbol.asyncIterator]() {
        const decoder = new TextDecoder();
        let buffer = "";
        const id = `chatcmpl-${randomUUID()}`;
        const created = Math.floor(Date.now() / 1000);
        for await (const chunk of body) {
          buffer += decoder.decode(chunk, { stream: true });
          const segments = buffer.split("\n\n");
          buffer = segments.pop() ?? "";
          for (const segment of segments) {
            const lines = segment.split("\n").map((line) => line.trim());
            let eventType = "";
            let data = "";
            for (const line of lines) {
              if (line.startsWith("event:")) {
                eventType = line.slice("event:".length).trim();
              }
              if (line.startsWith("data:")) {
                data = line.slice("data:".length).trim();
              }
            }
            if (!data) {
              continue;
            }
            const parsed = JSON.parse(data) as Record<string, unknown>;
            if (eventType === "content_block_delta") {
              const deltaText =
                typeof parsed.delta === "object" &&
                parsed.delta &&
                "text" in parsed.delta &&
                typeof parsed.delta.text === "string"
                  ? parsed.delta.text
                  : "";
              if (!deltaText) {
                continue;
              }
              yield {
                id,
                object: "chat.completion.chunk",
                created,
                model: request.model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      content: deltaText
                    },
                    finish_reason: null
                  }
                ]
              } satisfies StreamChunk;
            }
            if (eventType === "message_stop") {
              yield {
                id,
                object: "chat.completion.chunk",
                created,
                model: request.model,
                choices: [
                  {
                    index: 0,
                    delta: {},
                    finish_reason: "stop"
                  }
                ]
              } satisfies StreamChunk;
              return;
            }
          }
        }
      }
    };
  }

  async embeddings(): Promise<never> {
    throw new ProxyError("Anthropic does not support embeddings via this proxy", {
      statusCode: 400,
      code: "provider_unsupported_capability"
    });
  }

  async messages(request: AnthropicMessageRequest): Promise<AnthropicMessageResponse> {
    const response = await this.fetcher(`${this.baseUrl()}/messages`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(request)
    });
    await ensureOk(response);
    return (await response.json()) as AnthropicMessageResponse;
  }

  async *streamMessages(request: AnthropicMessageRequest): AsyncGenerator<AnthropicStreamEvent> {
    const response = await this.fetcher(`${this.baseUrl()}/messages`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ ...request, stream: true })
    });
    await ensureOk(response);
    const body = response.body;
    if (!body) {
      throw new ProxyError("Provider did not return a stream body", {
        statusCode: 502,
        code: "provider_stream_missing",
        retriable: true
      });
    }

    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of body) {
      buffer += decoder.decode(chunk, { stream: true });
      const segments = buffer.split("\n\n");
      buffer = segments.pop() ?? "";
      for (const segment of segments) {
        const lines = segment.split("\n").map((line) => line.trim());
        let eventType = "";
        let data = "";
        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventType = line.slice("event:".length).trim();
          }
          if (line.startsWith("data:")) {
            data = line.slice("data:".length).trim();
          }
        }
        if (!data) {
          continue;
        }
        const parsed = JSON.parse(data) as Record<string, unknown>;
        if (eventType) {
          yield { type: eventType, ...(parsed as object) } as AnthropicStreamEvent;
        }
      }
    }
  }

  async complete(request: AnthropicCompletionRequest): Promise<AnthropicCompletionResponse> {
    const messageRequest = completionToMessageRequest(request);
    const response = await this.messages(messageRequest);
    return {
      type: "completion",
      id: response.id,
      model: request.model,
      completion: response.content.map((part) => part.text).join(""),
      stop_reason: response.stop_reason
    };
  }

  async *streamComplete(request: AnthropicCompletionRequest): AsyncGenerator<AnthropicStreamEvent> {
    const messageRequest = completionToMessageRequest(request);
    for await (const event of this.streamMessages(messageRequest)) {
      if (event.type === "content_block_delta") {
        yield {
          type: "completion",
          completion: event.delta.text,
          stop_reason: null,
          model: request.model
        };
      } else if (event.type === "message_delta") {
        yield {
          type: "completion",
          completion: "",
          stop_reason: event.delta.stop_reason,
          model: request.model
        };
      }
    }
  }

  async countTokens(request: AnthropicCountTokensRequest): Promise<AnthropicCountTokensResponse> {
    const response = await this.fetcher(`${this.baseUrl()}/messages/count_tokens`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(request)
    });
    await ensureOk(response);
    return (await response.json()) as AnthropicCountTokensResponse;
  }

  private baseUrl() {
    return this.settings.baseUrl ?? DEFAULT_BASE_URL;
  }

  private headers() {
    return {
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": this.settings.apiKey
    };
  }
}

function toAnthropicPayload(request: ChatRequest, model: string, stream: boolean) {
  const systemMessages = request.messages.filter((message) => message.role === "system");
  const messages: AnthropicMessage[] = request.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content
    }));

  return {
    model,
    stream,
    max_tokens: request.max_tokens ?? 1024,
    temperature: request.temperature,
    top_p: request.top_p,
    system: systemMessages.map((message) => message.content).join("\n\n") || undefined,
    messages
  };
}

function completionToMessageRequest(request: AnthropicCompletionRequest): AnthropicMessageRequest {
  return {
    model: request.model,
    max_tokens: request.max_tokens_to_sample,
    temperature: request.temperature,
    top_p: request.top_p,
    stream: request.stream,
    messages: [
      {
        role: "user",
        content: request.prompt
      }
    ]
  };
}

function fromAnthropicResponse(response: AnthropicMessageResponse, requestedAlias: string): ChatResponse {
  const content = response.content.map((part) => part.text).join("");
  const message: ChatMessage = {
    role: "assistant",
    content
  };
  return {
    id: response.id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: requestedAlias,
    choices: [
      {
        index: 0,
        message,
        finish_reason: response.stop_reason ?? "stop"
      }
    ],
    usage: response.usage
      ? {
          prompt_tokens: response.usage.input_tokens,
          completion_tokens: response.usage.output_tokens,
          total_tokens: response.usage.input_tokens + response.usage.output_tokens
        }
      : undefined
  };
}

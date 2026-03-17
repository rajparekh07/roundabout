import { ProxyError } from "./errors.js";
import { createAdapter } from "./providers/index.js";
import type { FetchLike } from "./providers/base.js";
import { orderedTargets, resolveAlias } from "./routing.js";
import type {
  AnthropicCompletionRequest,
  AnthropicCompletionResponse,
  AnthropicCountTokensRequest,
  AnthropicCountTokensResponse,
  AnthropicMessageRequest,
  AnthropicMessageResponse,
  AnthropicStreamEvent,
  ChatRequest,
  ChatResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  RoundaboutConfig,
  StreamChunk
} from "./types.js";
import { AnthropicAdapter } from "./providers/anthropic.js";
import type { ProviderKind, RouteTarget } from "./types.js";

export class ProxyService {
  constructor(
    private readonly config: RoundaboutConfig,
    private readonly fetcher?: FetchLike
  ) {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const route = resolveAlias(this.config, request.model, "chat");
    let lastError: unknown;

    for (const target of orderedTargets(route)) {
      try {
        const adapter = createAdapter(this.config, target.provider, this.fetcher);
        const response = await adapter.chat(request, target.model);
        return {
          ...response,
          model: request.model
        };
      } catch (error) {
        lastError = error;
        if (!(error instanceof ProxyError) || !error.retriable) {
          throw error;
        }
      }
    }

    throw lastError ?? new ProxyError("All providers failed", {
      statusCode: 502,
      code: "all_targets_failed",
      retriable: true
    });
  }

  async *streamChat(request: ChatRequest): AsyncGenerator<StreamChunk> {
    const route = resolveAlias(this.config, request.model, "chat");
    let lastError: unknown;

    for (const target of orderedTargets(route)) {
      try {
        const adapter = createAdapter(this.config, target.provider, this.fetcher);
        const stream = await adapter.streamChat(request, target.model);
        for await (const chunk of stream) {
          yield {
            ...chunk,
            model: request.model
          };
        }
        return;
      } catch (error) {
        lastError = error;
        if (!(error instanceof ProxyError) || !error.retriable) {
          throw error;
        }
      }
    }

    throw lastError ?? new ProxyError("All providers failed", {
      statusCode: 502,
      code: "all_targets_failed",
      retriable: true
    });
  }

  async embeddings(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const route = resolveAlias(this.config, request.model, "embeddings");
    let lastError: unknown;

    for (const target of orderedTargets(route)) {
      try {
        const adapter = createAdapter(this.config, target.provider, this.fetcher);
        const response = await adapter.embeddings(request, target.model);
        return {
          ...response,
          model: request.model
        };
      } catch (error) {
        lastError = error;
        if (!(error instanceof ProxyError) || !error.retriable) {
          throw error;
        }
      }
    }

    throw lastError ?? new ProxyError("All providers failed", {
      statusCode: 502,
      code: "all_targets_failed",
      retriable: true
    });
  }

  async messages(request: AnthropicMessageRequest): Promise<AnthropicMessageResponse> {
    const resolved = this.resolveAnthropicTarget(request.model, "chat");
    if (resolved.kind === "direct") {
      return this.anthropicAdapter().messages(request);
    }

    return this.tryTargets(resolved.targets, async (target) => {
      if (target.provider === "anthropic") {
        return this.anthropicAdapter().messages({ ...request, model: target.model });
      }
      const response = await createAdapter(this.config, target.provider, this.fetcher).chat(
        anthropicMessageToChatRequest(request),
        target.model
      );
      return openAiChatToAnthropicMessage(response, request.model);
    });
  }

  async *streamMessages(request: AnthropicMessageRequest): AsyncGenerator<AnthropicStreamEvent> {
    const resolved = this.resolveAnthropicTarget(request.model, "chat");
    if (resolved.kind === "direct") {
      yield* this.anthropicAdapter().streamMessages(request);
      return;
    }

    for (const target of resolved.targets) {
      try {
        if (target.provider === "anthropic") {
          yield* this.anthropicAdapter().streamMessages({ ...request, model: target.model, stream: true });
          return;
        }

        const stream = await createAdapter(this.config, target.provider, this.fetcher).streamChat(
          anthropicMessageToChatRequest({ ...request, stream: true }),
          target.model
        );
        yield* openAiStreamToAnthropicEvents(stream, request.model);
        return;
      } catch (error) {
        if (!(error instanceof ProxyError) || !error.retriable) {
          throw error;
        }
      }
    }

    throw new ProxyError("All providers failed", {
      statusCode: 502,
      code: "all_targets_failed",
      retriable: true
    });
  }

  async complete(request: AnthropicCompletionRequest): Promise<AnthropicCompletionResponse> {
    const response = await this.messages(completionToMessagesRequest(request));
    return {
      type: "completion",
      id: response.id,
      model: request.model,
      completion: response.content.map((part) => part.text).join(""),
      stop_reason: response.stop_reason
    };
  }

  async *streamComplete(request: AnthropicCompletionRequest): AsyncGenerator<AnthropicStreamEvent> {
    for await (const event of this.streamMessages(completionToMessagesRequest({ ...request, stream: true }))) {
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
    const resolved = this.resolveAnthropicTarget(request.model, "chat");
    if (resolved.kind === "direct") {
      return this.anthropicAdapter().countTokens(request);
    }

    return {
      input_tokens: estimateAnthropicInputTokens(request)
    };
  }

  private anthropicAdapter() {
    const adapter = createAdapter(this.config, "anthropic", this.fetcher);
    if (!(adapter instanceof AnthropicAdapter)) {
      throw new ProxyError("Anthropic adapter unavailable", {
        statusCode: 500,
        code: "anthropic_adapter_unavailable"
      });
    }
    return adapter;
  }

  private resolveAnthropicTarget(model: string, capability: "chat" | "embeddings") {
    const route = this.config.aliases[model];
    if (!route) {
      return {
        kind: "direct" as const
      };
    }
    if (!route.capabilities.includes(capability)) {
      throw new ProxyError(`Model alias does not support ${capability}: ${model}`, {
        statusCode: 400,
        code: "unsupported_capability"
      });
    }
    return {
      kind: "alias" as const,
      targets: orderedTargets(route)
    };
  }

  private async tryTargets<T>(targets: RouteTarget[], fn: (target: RouteTarget) => Promise<T>) {
    let lastError: unknown;
    for (const target of targets) {
      try {
        return await fn(target);
      } catch (error) {
        lastError = error;
        if (!(error instanceof ProxyError) || !error.retriable) {
          throw error;
        }
      }
    }
    throw lastError ?? new ProxyError("All providers failed", {
      statusCode: 502,
      code: "all_targets_failed",
      retriable: true
    });
  }
}

function anthropicMessageToChatRequest(request: AnthropicMessageRequest): ChatRequest {
  const messages = request.messages.map((message) => ({
    role: message.role,
    content:
      typeof message.content === "string"
        ? message.content
        : message.content
            .filter((block) => block.type === "text")
            .map((block) => block.text)
            .join("")
  })) as ChatRequest["messages"];

  if (request.system) {
    messages.unshift({
      role: "system",
      content: request.system
    });
  }

  return {
    model: request.model,
    messages,
    stream: request.stream,
    temperature: request.temperature,
    max_tokens: request.max_tokens,
    top_p: request.top_p
  };
}

function completionToMessagesRequest(request: AnthropicCompletionRequest): AnthropicMessageRequest {
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

function openAiChatToAnthropicMessage(response: ChatResponse, requestedModel: string): AnthropicMessageResponse {
  return {
    id: response.id,
    type: "message",
    role: "assistant",
    model: requestedModel,
    content: [
      {
        type: "text",
        text: response.choices[0]?.message.content ?? ""
      }
    ],
    stop_reason: response.choices[0]?.finish_reason ?? "stop",
    stop_sequence: null,
    usage: response.usage
      ? {
          input_tokens: response.usage.prompt_tokens ?? 0,
          output_tokens: response.usage.completion_tokens ?? 0
        }
      : undefined
  };
}

async function* openAiStreamToAnthropicEvents(
  stream: AsyncIterable<StreamChunk>,
  requestedModel: string
): AsyncGenerator<AnthropicStreamEvent> {
  let started = false;
  let emittedContentStart = false;
  let outputTokens = 0;
  for await (const chunk of stream) {
    if (!started) {
      started = true;
      yield {
        type: "message_start",
        message: {
          id: chunk.id,
          type: "message",
          role: "assistant",
          model: requestedModel,
          content: [],
          stop_reason: null
        }
      };
    }
    const content = chunk.choices[0]?.delta.content ?? "";
    if (content) {
      if (!emittedContentStart) {
        emittedContentStart = true;
        yield {
          type: "content_block_start",
          index: 0,
          content_block: {
            type: "text",
            text: ""
          }
        };
      }
      outputTokens += estimateTextTokens(content);
      yield {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "text_delta",
          text: content
        }
      };
    }
    const finishReason = chunk.choices[0]?.finish_reason;
    if (finishReason) {
      if (emittedContentStart) {
        yield {
          type: "content_block_stop",
          index: 0
        };
      }
      yield {
        type: "message_delta",
        delta: {
          stop_reason: finishReason
        },
        usage: {
          output_tokens: outputTokens
        }
      };
      yield {
        type: "message_stop"
      };
    }
  }
}

function estimateAnthropicInputTokens(request: AnthropicCountTokensRequest) {
  const parts = [
    request.system ?? "",
    ...(request.messages ?? []).map((message) =>
      typeof message.content === "string"
        ? message.content
        : message.content.map((block) => block.text).join("")
    )
  ];
  return estimateTextTokens(parts.join(" "));
}

function estimateTextTokens(text: string) {
  if (!text.trim()) {
    return 0;
  }
  return Math.max(1, Math.ceil(text.trim().split(/\s+/).length * 1.3));
}

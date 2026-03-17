import { buildAppContainer } from "./bootstrap/build-app.js";
import type { DebugLogger } from "./debug.js";
import type { FetchLike } from "./providers/base.js";
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

export class ProxyService {
  private readonly services;

  constructor(
    config: RoundaboutConfig,
    fetcher?: FetchLike,
    logger: DebugLogger = { enabled: false, log() {} }
  ) {
    this.services = buildAppContainer(config, fetcher, logger);
  }

  chat(request: ChatRequest): Promise<ChatResponse> {
    return this.services.chatService.execute(request);
  }

  streamChat(request: ChatRequest): AsyncGenerator<StreamChunk> {
    return this.services.chatService.stream(request);
  }

  embeddings(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    return this.services.embeddingService.execute(request);
  }

  messages(request: AnthropicMessageRequest): Promise<AnthropicMessageResponse> {
    return this.services.anthropicMessagesService.execute(request);
  }

  streamMessages(request: AnthropicMessageRequest): AsyncGenerator<AnthropicStreamEvent> {
    return this.services.anthropicMessagesService.stream(request);
  }

  complete(request: AnthropicCompletionRequest): Promise<AnthropicCompletionResponse> {
    return this.services.anthropicCompletionsService.execute(request);
  }

  streamComplete(request: AnthropicCompletionRequest): AsyncGenerator<AnthropicStreamEvent> {
    return this.services.anthropicCompletionsService.stream(request);
  }

  countTokens(request: AnthropicCountTokensRequest): Promise<AnthropicCountTokensResponse> {
    return this.services.tokenCountService.execute(request);
  }
}

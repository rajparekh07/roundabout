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
  StreamChunk
} from "../types.js";

export type FetchLike = typeof fetch;

export interface ProviderStream {
  [Symbol.asyncIterator](): AsyncIterator<StreamChunk>;
}

export interface ChatAdapter {
  chat(request: ChatRequest, model: string): Promise<ChatResponse>;
  streamChat(request: ChatRequest, model: string): Promise<ProviderStream>;
}

export interface EmbeddingAdapter {
  embeddings(request: EmbeddingRequest, model: string): Promise<EmbeddingResponse>;
}

export interface AnthropicNativeAdapter {
  messages(request: AnthropicMessageRequest): Promise<AnthropicMessageResponse>;
  streamMessages(request: AnthropicMessageRequest): AsyncGenerator<AnthropicStreamEvent>;
  complete(request: AnthropicCompletionRequest): Promise<AnthropicCompletionResponse>;
  streamComplete(request: AnthropicCompletionRequest): AsyncGenerator<AnthropicStreamEvent>;
  countTokens(request: AnthropicCountTokensRequest): Promise<AnthropicCountTokensResponse>;
}

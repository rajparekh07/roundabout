import type {
  ChatRequest,
  ChatResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  ProviderKind,
  StreamChunk
} from "../types.js";

export type FetchLike = typeof fetch;

export interface ProviderStream {
  [Symbol.asyncIterator](): AsyncIterator<StreamChunk>;
}

export interface ProviderAdapter {
  readonly kind: ProviderKind;
  chat(request: ChatRequest, model: string): Promise<ChatResponse>;
  streamChat(request: ChatRequest, model: string): Promise<ProviderStream>;
  embeddings(request: EmbeddingRequest, model: string): Promise<EmbeddingResponse>;
}

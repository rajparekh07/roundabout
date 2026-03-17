import type {
  ChatRequest,
  ChatResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  ProviderSettings
} from "../types.js";
import type { FetchLike, ProviderAdapter, ProviderStream } from "./base.js";
import { OpenAiAdapter } from "./openai.js";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

export class OpenRouterAdapter implements ProviderAdapter {
  public readonly kind = "openrouter" as const;
  private readonly delegate: OpenAiAdapter;

  constructor(settings: ProviderSettings, fetcher?: FetchLike) {
    this.delegate = new OpenAiAdapter(
      {
        ...settings,
        baseUrl: settings.baseUrl ?? DEFAULT_BASE_URL
      },
      fetcher
    );
  }

  chat(request: ChatRequest, model: string): Promise<ChatResponse> {
    return this.delegate.chat(request, model);
  }

  streamChat(request: ChatRequest, model: string): Promise<ProviderStream> {
    return this.delegate.streamChat(request, model);
  }

  embeddings(request: EmbeddingRequest, model: string): Promise<EmbeddingResponse> {
    return this.delegate.embeddings(request, model);
  }
}

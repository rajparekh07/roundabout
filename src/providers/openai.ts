import { ProxyError } from "../errors.js";
import type {
  ChatRequest,
  ChatResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  ProviderSettings,
  StreamChunk
} from "../types.js";
import { ensureOk, getFetch } from "./http.js";
import type { FetchLike, ProviderAdapter, ProviderStream } from "./base.js";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export class OpenAiAdapter implements ProviderAdapter {
  public readonly kind = "openai" as const;
  private readonly fetcher: FetchLike;
  private readonly settings: ProviderSettings;

  constructor(settings: ProviderSettings, fetcher?: FetchLike) {
    this.settings = settings;
    this.fetcher = getFetch(fetcher);
  }

  async chat(request: ChatRequest, model: string): Promise<ChatResponse> {
    const response = await this.fetcher(`${this.baseUrl()}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ ...request, model, stream: false })
    });
    await ensureOk(response);
    return (await response.json()) as ChatResponse;
  }

  async streamChat(request: ChatRequest, model: string): Promise<ProviderStream> {
    const response = await this.fetcher(`${this.baseUrl()}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ ...request, model, stream: true })
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
        for await (const chunk of body) {
          buffer += decoder.decode(chunk, { stream: true });
          const segments = buffer.split("\n\n");
          buffer = segments.pop() ?? "";

          for (const segment of segments) {
            const lines = segment
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean);
            for (const line of lines) {
              if (!line.startsWith("data:")) {
                continue;
              }
              const value = line.slice("data:".length).trim();
              if (value === "[DONE]") {
                return;
              }
              yield JSON.parse(value) as StreamChunk;
            }
          }
        }
      }
    };
  }

  async embeddings(request: EmbeddingRequest, model: string): Promise<EmbeddingResponse> {
    const response = await this.fetcher(`${this.baseUrl()}/embeddings`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ ...request, model })
    });
    await ensureOk(response);
    return (await response.json()) as EmbeddingResponse;
  }

  private baseUrl() {
    return this.settings.baseUrl ?? DEFAULT_BASE_URL;
  }

  private headers() {
    return {
      "content-type": "application/json",
      authorization: `Bearer ${this.settings.apiKey}`
    };
  }
}

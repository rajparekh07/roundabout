import type { DebugLogger } from "../debug.js";
import type { AnthropicNativeAdapter, ChatAdapter, EmbeddingAdapter, FetchLike } from "../providers/base.js";
import type { ProviderDescriptorRegistry } from "../providers/provider-descriptor.js";
import type {
  ModelRoute,
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
  ProviderName,
  ProviderSettings,
  RoundaboutConfig,
  StreamChunk
} from "../types.js";

export interface FeatureService<TRequest, TResponse> {
  execute(request: TRequest): Promise<TResponse>;
}

export interface StreamFeatureService<TRequest, TEvent> {
  stream(request: TRequest): AsyncGenerator<TEvent>;
}

export interface ChatGateway {
  chat(request: ChatRequest, model: string): Promise<ChatResponse>;
  streamChat(request: ChatRequest, model: string): Promise<AsyncIterable<StreamChunk>>;
}

export interface EmbeddingGateway {
  embeddings(request: EmbeddingRequest, model: string): Promise<EmbeddingResponse>;
}

export interface AnthropicGateway {
  messages(request: AnthropicMessageRequest): Promise<AnthropicMessageResponse>;
  streamMessages(request: AnthropicMessageRequest): AsyncGenerator<AnthropicStreamEvent>;
  complete(request: AnthropicCompletionRequest): Promise<AnthropicCompletionResponse>;
  streamComplete(request: AnthropicCompletionRequest): AsyncGenerator<AnthropicStreamEvent>;
  countTokens(request: AnthropicCountTokensRequest): Promise<AnthropicCountTokensResponse>;
}

export interface ProviderAdapterFactory {
  create(provider: ProviderName): ChatAdapter;
}

export interface ModelRepository {
  get(modelKey: string): ModelRoute | undefined;
  list(): Record<string, ModelRoute>;
}

export interface TokenRepository {
  findProjectByToken(token: string): string | null;
  list(): RoundaboutConfig["tokens"];
}

export interface ConfigRepository {
  getPath(): string;
  load(): Promise<RoundaboutConfig>;
  save(config: RoundaboutConfig): Promise<void>;
}

export interface ServerDependencies {
  config: RoundaboutConfig;
  logger: DebugLogger;
  authTokenService: {
    validate(headers: { authorization?: string; "x-api-key"?: string }): { project: string } | null;
  };
  chatService: FeatureService<ChatRequest, ChatResponse> & StreamFeatureService<ChatRequest, StreamChunk>;
  embeddingService: FeatureService<EmbeddingRequest, EmbeddingResponse>;
  anthropicMessagesService: FeatureService<AnthropicMessageRequest, AnthropicMessageResponse> &
    StreamFeatureService<AnthropicMessageRequest, AnthropicStreamEvent>;
  anthropicCompletionsService: FeatureService<AnthropicCompletionRequest, AnthropicCompletionResponse> &
    StreamFeatureService<AnthropicCompletionRequest, AnthropicStreamEvent>;
  tokenCountService: FeatureService<AnthropicCountTokensRequest, AnthropicCountTokensResponse>;
}

export interface CliDependencies {
  configRepository: ConfigRepository;
  descriptorRegistry: ProviderDescriptorRegistry;
  configurationService: {
    load(): Promise<RoundaboutConfig>;
    save(config: RoundaboutConfig): Promise<void>;
    getPath(): string;
    summarizeProviders(config: RoundaboutConfig): Array<{ provider: string; enabled: boolean }>;
    setProvider(config: RoundaboutConfig, provider: ProviderName, settings: ProviderSettings): void;
    setModel(config: RoundaboutConfig, modelKey: string, route: ModelRoute): void;
    setToken(config: RoundaboutConfig, project: string, token: string): void;
  };
  tokenAdminService: {
    create(project: string): Promise<string>;
    rotate(project: string): Promise<string>;
    list(): Promise<Array<{ project: string; updatedAt: string; tokenPreview: string }>>;
    get(project: string): Promise<string | null>;
  };
  statusService: {
    summary(): Promise<{
      configPath: string;
      daemon: string;
      providers: Array<{ provider: string; enabled: boolean }>;
      modelCount: number;
      tokenCount: number;
      health: string;
    }>;
  };
  startDependencies: (logger: DebugLogger) => Promise<ServerDependencies>;
}

export interface AppContainer {
  config: RoundaboutConfig;
  logger: DebugLogger;
  fetcher?: FetchLike;
  modelRepository: ModelRepository;
  tokenRepository: TokenRepository;
  authTokenService: ServerDependencies["authTokenService"];
  providerAdapterFactory: ProviderAdapterFactory;
}

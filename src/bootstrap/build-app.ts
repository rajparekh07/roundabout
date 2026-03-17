import type { DebugLogger } from "../debug.js";
import type { FetchLike } from "../providers/base.js";
import type { RoundaboutConfig } from "../types.js";
import { AliasResolver } from "../core/alias-resolver.js";
import type { AppContainer, ServerDependencies } from "../core/contracts.js";
import { FallbackExecutor } from "../core/fallback-executor.js";
import { DefaultProviderAdapterFactory } from "../core/provider-adapter-factory.js";
import { ProviderRegistry } from "../core/provider-registry.js";
import { InMemoryAliasRepository, InMemoryTokenRepository } from "../core/repositories.js";
import { TokenAuthService } from "../features/auth/token-auth-service.js";
import { ChatService } from "../features/chat/chat-service.js";
import { EmbeddingService } from "../features/embeddings/embedding-service.js";
import { AnthropicMessagesService } from "../features/anthropic/messages-service.js";
import { AnthropicCompletionsService } from "../features/anthropic/completions-service.js";
import { TokenCountService } from "../features/anthropic/token-count-service.js";

export function buildAppContainer(
  config: RoundaboutConfig,
  fetcher?: FetchLike,
  logger: DebugLogger = { enabled: false, log() {} }
): AppContainer & ServerDependencies {
  const aliasRepository = new InMemoryAliasRepository(config.aliases);
  const tokenRepository = new InMemoryTokenRepository(config);
  const authTokenService = new TokenAuthService(tokenRepository);
  const providerAdapterFactory = new DefaultProviderAdapterFactory(config, fetcher);
  const providerRegistry = new ProviderRegistry(providerAdapterFactory);
  const aliasResolver = new AliasResolver(aliasRepository);
  const fallbackExecutor = new FallbackExecutor();

  const chatService = new ChatService(aliasResolver, fallbackExecutor, providerRegistry);
  const embeddingService = new EmbeddingService(aliasResolver, fallbackExecutor, providerRegistry);
  const anthropicMessagesService = new AnthropicMessagesService(aliasResolver, fallbackExecutor, providerRegistry);
  const anthropicCompletionsService = new AnthropicCompletionsService(anthropicMessagesService);
  const tokenCountService = new TokenCountService(aliasResolver, providerRegistry);

  return {
    config,
    fetcher,
    logger,
    aliasRepository,
    tokenRepository,
    authTokenService,
    providerAdapterFactory,
    chatService,
    embeddingService,
    anthropicMessagesService,
    anthropicCompletionsService,
    tokenCountService
  };
}

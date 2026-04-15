import type { FeatureService } from "../../core/contracts.js";
import { ModelResolver } from "../../core/model-resolver.js";
import { FallbackExecutor } from "../../core/fallback-executor.js";
import { ProviderRegistry } from "../../core/provider-registry.js";
import type { EmbeddingResponse } from "../../types.js";
import type { EmbeddingCommand } from "./contracts.js";

export class EmbeddingService implements FeatureService<EmbeddingCommand, EmbeddingResponse> {
  constructor(
    private readonly models: ModelResolver,
    private readonly fallback: FallbackExecutor,
    private readonly providers: ProviderRegistry
  ) {}

  async execute(command: EmbeddingCommand): Promise<EmbeddingResponse> {
    const targets = this.models.resolveRequired(command.model, "embeddings");
    return this.fallback.execute(targets, async (target) => {
      const response = await this.providers.getEmbeddingGateway(target.provider).embeddings(command, target.model);
      return {
        ...response,
        model: command.model
      };
    });
  }
}
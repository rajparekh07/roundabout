import type { FeatureService } from "../../core/contracts.js";
import { ModelResolver } from "../../core/model-resolver.js";
import { ProviderRegistry } from "../../core/provider-registry.js";
import type { AnthropicCountTokensResponse } from "../../types.js";
import { estimateTokenCount } from "./mappers.js";
import type { TokenCountCommand } from "./contracts.js";

export class TokenCountService implements FeatureService<TokenCountCommand, AnthropicCountTokensResponse> {
  constructor(
    private readonly models: ModelResolver,
    private readonly providers: ProviderRegistry
  ) {}

  async execute(command: TokenCountCommand): Promise<AnthropicCountTokensResponse> {
    const targets = this.models.resolveRequired(command.model, "chat");
    const firstTarget = targets[0];
    if (this.providers.supportsAnthropicNative(firstTarget.provider)) {
      return this.providers.getAnthropicGateway(firstTarget.provider).countTokens(command);
    }

    return {
      input_tokens: estimateTokenCount(command)
    };
  }
}
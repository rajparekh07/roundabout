import type { FeatureService } from "../../core/contracts.js";
import { AliasResolver } from "../../core/alias-resolver.js";
import { ProviderRegistry } from "../../core/provider-registry.js";
import type { AnthropicCountTokensResponse } from "../../types.js";
import { estimateTokenCount } from "./mappers.js";
import type { TokenCountCommand } from "./contracts.js";

export class TokenCountService implements FeatureService<TokenCountCommand, AnthropicCountTokensResponse> {
  constructor(
    private readonly aliases: AliasResolver,
    private readonly providers: ProviderRegistry
  ) {}

  async execute(command: TokenCountCommand): Promise<AnthropicCountTokensResponse> {
    const resolved = this.aliases.resolveAnthropicModel(command.model, "chat");
    if (resolved.kind === "direct") {
      return this.providers.getAnthropicGateway(resolved.provider).countTokens(command);
    }

    return {
      input_tokens: estimateTokenCount(command)
    };
  }
}

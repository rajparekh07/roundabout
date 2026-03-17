import type { FeatureService, StreamFeatureService } from "../../core/contracts.js";
import { AliasResolver } from "../../core/alias-resolver.js";
import { FallbackExecutor } from "../../core/fallback-executor.js";
import { ProviderRegistry } from "../../core/provider-registry.js";
import type { AnthropicMessageResponse, AnthropicStreamEvent } from "../../types.js";
import { anthropicMessageToChatRequest, openAiChatToAnthropicMessage, openAiStreamToAnthropicEvents } from "./mappers.js";
import type { AnthropicMessageCommand } from "./contracts.js";

export class AnthropicMessagesService
  implements
    FeatureService<AnthropicMessageCommand, AnthropicMessageResponse>,
    StreamFeatureService<AnthropicMessageCommand, AnthropicStreamEvent>
{
  constructor(
    private readonly aliases: AliasResolver,
    private readonly fallback: FallbackExecutor,
    private readonly providers: ProviderRegistry
  ) {}

  async execute(command: AnthropicMessageCommand): Promise<AnthropicMessageResponse> {
    const resolved = this.aliases.resolveAnthropicModel(command.model, "chat");
    if (resolved.kind === "direct") {
      return this.providers.getAnthropicGateway(resolved.provider).messages(command);
    }

    return this.fallback.execute(resolved.targets, async (target) => {
      if (target.provider === "anthropic") {
        return this.providers.getAnthropicGateway(target.provider).messages({
          ...command,
          model: target.model
        });
      }

      const response = await this.providers
        .getChatGateway(target.provider)
        .chat(anthropicMessageToChatRequest(command), target.model);
      return openAiChatToAnthropicMessage(response, command.model);
    });
  }

  async *stream(command: AnthropicMessageCommand): AsyncGenerator<AnthropicStreamEvent> {
    const resolved = this.aliases.resolveAnthropicModel(command.model, "chat");
    if (resolved.kind === "direct") {
      yield* this.providers.getAnthropicGateway(resolved.provider).streamMessages(command);
      return;
    }

    const stream = await this.fallback.execute(resolved.targets, async (target) => {
      if (target.provider === "anthropic") {
        return this.providers.getAnthropicGateway(target.provider).streamMessages({
          ...command,
          model: target.model,
          stream: true
        });
      }

      const providerStream = await this.providers
        .getChatGateway(target.provider)
        .streamChat(anthropicMessageToChatRequest({ ...command, stream: true }), target.model);
      return openAiStreamToAnthropicEvents(providerStream, command.model);
    });

    yield* stream;
  }
}

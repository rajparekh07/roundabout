import type { FeatureService, StreamFeatureService } from "../../core/contracts.js";
import { AliasResolver } from "../../core/alias-resolver.js";
import { FallbackExecutor } from "../../core/fallback-executor.js";
import { ProviderRegistry } from "../../core/provider-registry.js";
import type { ChatResponse, StreamChunk } from "../../types.js";
import type { ChatCommand } from "./contracts.js";

export class ChatService
  implements FeatureService<ChatCommand, ChatResponse>, StreamFeatureService<ChatCommand, StreamChunk>
{
  constructor(
    private readonly aliases: AliasResolver,
    private readonly fallback: FallbackExecutor,
    private readonly providers: ProviderRegistry
  ) {}

  async execute(command: ChatCommand): Promise<ChatResponse> {
    const route = this.aliases.resolveRequired(command.model, "chat");
    return this.fallback.execute([route.primary, ...route.fallbacks], async (target) => {
      const response = await this.providers.getChatGateway(target.provider).chat(command, target.model);
      return {
        ...response,
        model: command.model
      };
    });
  }

  async *stream(command: ChatCommand): AsyncGenerator<StreamChunk> {
    const route = this.aliases.resolveRequired(command.model, "chat");
    const stream = await this.fallback.execute([route.primary, ...route.fallbacks], (target) =>
      this.providers.getChatGateway(target.provider).streamChat(command, target.model)
    );

    for await (const chunk of stream) {
      yield {
        ...chunk,
        model: command.model
      };
    }
  }
}

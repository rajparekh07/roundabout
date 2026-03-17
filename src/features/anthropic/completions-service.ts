import type { FeatureService, StreamFeatureService } from "../../core/contracts.js";
import type {
  AnthropicCompletionResponse,
  AnthropicStreamEvent
} from "../../types.js";
import { anthropicMessageToCompletion, completionToMessageCommand } from "./mappers.js";
import type { AnthropicCompletionCommand } from "./contracts.js";
import { AnthropicMessagesService } from "./messages-service.js";

export class AnthropicCompletionsService
  implements
    FeatureService<AnthropicCompletionCommand, AnthropicCompletionResponse>,
    StreamFeatureService<AnthropicCompletionCommand, AnthropicStreamEvent>
{
  constructor(private readonly messages: AnthropicMessagesService) {}

  async execute(command: AnthropicCompletionCommand): Promise<AnthropicCompletionResponse> {
    const response = await this.messages.execute(completionToMessageCommand(command));
    return anthropicMessageToCompletion(response, command);
  }

  async *stream(command: AnthropicCompletionCommand): AsyncGenerator<AnthropicStreamEvent> {
    for await (const event of this.messages.stream(completionToMessageCommand({ ...command, stream: true }))) {
      if (event.type === "content_block_delta") {
        yield {
          type: "completion",
          completion: event.delta.text,
          stop_reason: null,
          model: command.model
        };
      } else if (event.type === "message_delta") {
        yield {
          type: "completion",
          completion: "",
          stop_reason: event.delta.stop_reason,
          model: command.model
        };
      }
    }
  }
}

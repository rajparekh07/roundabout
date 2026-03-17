import type {
  AnthropicCompletionResponse,
  AnthropicMessageResponse,
  AnthropicStreamEvent,
  ChatRequest,
  ChatResponse,
  StreamChunk
} from "../../types.js";
import type {
  AnthropicCompletionCommand,
  AnthropicMessageCommand,
  TokenCountCommand
} from "./contracts.js";

export function anthropicMessageToChatRequest(command: AnthropicMessageCommand): ChatRequest {
  const messages = command.messages.map((message) => ({
    role: message.role,
    content:
      typeof message.content === "string"
        ? message.content
        : message.content
            .filter((block) => block.type === "text")
            .map((block) => block.text)
            .join("")
  })) as ChatRequest["messages"];

  if (command.system) {
    messages.unshift({
      role: "system",
      content: command.system
    });
  }

  return {
    model: command.model,
    messages,
    stream: command.stream,
    temperature: command.temperature,
    max_tokens: command.max_tokens,
    top_p: command.top_p
  };
}

export function completionToMessageCommand(command: AnthropicCompletionCommand): AnthropicMessageCommand {
  return {
    model: command.model,
    max_tokens: command.max_tokens_to_sample,
    temperature: command.temperature,
    top_p: command.top_p,
    stream: command.stream,
    messages: [
      {
        role: "user",
        content: command.prompt
      }
    ]
  };
}

export function openAiChatToAnthropicMessage(response: ChatResponse, requestedModel: string): AnthropicMessageResponse {
  return {
    id: response.id,
    type: "message",
    role: "assistant",
    model: requestedModel,
    content: [
      {
        type: "text",
        text: response.choices[0]?.message.content ?? ""
      }
    ],
    stop_reason: response.choices[0]?.finish_reason ?? "stop",
    stop_sequence: null,
    usage: response.usage
      ? {
          input_tokens: response.usage.prompt_tokens ?? 0,
          output_tokens: response.usage.completion_tokens ?? 0
        }
      : undefined
  };
}

export async function* openAiStreamToAnthropicEvents(
  stream: AsyncIterable<StreamChunk>,
  requestedModel: string
): AsyncGenerator<AnthropicStreamEvent> {
  let started = false;
  let emittedContentStart = false;
  let outputTokens = 0;

  for await (const chunk of stream) {
    if (!started) {
      started = true;
      yield {
        type: "message_start",
        message: {
          id: chunk.id,
          type: "message",
          role: "assistant",
          model: requestedModel,
          content: [],
          stop_reason: null
        }
      };
    }

    const content = chunk.choices[0]?.delta.content ?? "";
    if (content) {
      if (!emittedContentStart) {
        emittedContentStart = true;
        yield {
          type: "content_block_start",
          index: 0,
          content_block: {
            type: "text",
            text: ""
          }
        };
      }
      outputTokens += estimateTextTokens(content);
      yield {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "text_delta",
          text: content
        }
      };
    }

    const finishReason = chunk.choices[0]?.finish_reason;
    if (finishReason) {
      if (emittedContentStart) {
        yield {
          type: "content_block_stop",
          index: 0
        };
      }
      yield {
        type: "message_delta",
        delta: {
          stop_reason: finishReason
        },
        usage: {
          output_tokens: outputTokens
        }
      };
      yield {
        type: "message_stop"
      };
    }
  }
}

export function anthropicMessageToCompletion(
  response: AnthropicMessageResponse,
  command: AnthropicCompletionCommand
): AnthropicCompletionResponse {
  return {
    type: "completion",
    id: response.id,
    model: command.model,
    completion: response.content.map((part) => part.text).join(""),
    stop_reason: response.stop_reason
  };
}

export function estimateTokenCount(command: TokenCountCommand) {
  const parts = [
    command.system ?? "",
    ...(command.messages ?? []).map((message) =>
      typeof message.content === "string"
        ? message.content
        : message.content.map((block) => block.text).join("")
    )
  ];

  const text = parts.join(" ").trim();
  if (!text) {
    return 0;
  }

  return Math.max(1, Math.ceil(text.split(/\s+/).length * 1.3));
}

function estimateTextTokens(text: string) {
  return Math.max(1, Math.ceil(text.trim().split(/\s+/).length * 1.3));
}

import type { AnthropicMessage } from "../../types.js";

export interface AnthropicMessageCommand {
  model: string;
  messages: AnthropicMessage[];
  system?: string;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
}

export interface AnthropicCompletionCommand {
  model: string;
  prompt: string;
  max_tokens_to_sample?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  stop_sequences?: string[];
}

export interface TokenCountCommand {
  model: string;
  messages?: AnthropicMessage[];
  system?: string;
}

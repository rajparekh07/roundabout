import type { ChatMessage } from "../../types.js";

export interface ChatCommand {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
}

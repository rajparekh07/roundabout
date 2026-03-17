export type ProviderKind = "openai" | "anthropic" | "openrouter";

export interface DaemonConfig {
  host: string;
  port: number;
}

export interface ProviderSettings {
  enabled: boolean;
  apiKey: string;
  baseUrl?: string;
}

export interface RouteTarget {
  provider: ProviderKind;
  model: string;
}

export interface AliasRoute {
  primary: RouteTarget;
  fallbacks: RouteTarget[];
  capabilities: Array<"chat" | "embeddings">;
}

export interface ProjectToken {
  token: string;
  createdAt: string;
  updatedAt: string;
}

export interface RoundaboutConfig {
  daemon: DaemonConfig;
  providers: Partial<Record<ProviderKind, ProviderSettings>>;
  aliases: Record<string, AliasRoute>;
  tokens: Record<string, ProjectToken>;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
}

export interface ChatChoice {
  index: number;
  message: ChatMessage;
  finish_reason: string | null;
}

export interface ChatResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface StreamChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: Partial<ChatMessage>;
    finish_reason: string | null;
  }>;
}

export interface EmbeddingRequest {
  model: string;
  input: string | string[];
}

export interface EmbeddingResponse {
  object: "list";
  data: Array<{
    object: "embedding";
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage?: {
    prompt_tokens?: number;
    total_tokens?: number;
  };
}

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | Array<{ type: "text"; text: string }>;
}

export interface AnthropicMessageRequest {
  model: string;
  messages: AnthropicMessage[];
  system?: string;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
}

export interface AnthropicMessageResponse {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: Array<{ type: "text"; text: string }>;
  stop_reason: string | null;
  stop_sequence?: string | null;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface AnthropicCompletionRequest {
  model: string;
  prompt: string;
  max_tokens_to_sample?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  stop_sequences?: string[];
}

export interface AnthropicCompletionResponse {
  type: "completion";
  id: string;
  model: string;
  completion: string;
  stop_reason: string | null;
}

export interface AnthropicCountTokensRequest {
  model: string;
  messages?: AnthropicMessage[];
  system?: string;
}

export interface AnthropicCountTokensResponse {
  input_tokens: number;
}

export type AnthropicStreamEvent =
  | { type: "message_start"; message: AnthropicMessageResponse }
  | { type: "content_block_start"; index: number; content_block: { type: "text"; text: string } }
  | { type: "content_block_delta"; index: number; delta: { type: "text_delta"; text: string } }
  | { type: "content_block_stop"; index: number }
  | { type: "message_delta"; delta: { stop_reason: string | null; stop_sequence?: string | null }; usage?: { output_tokens: number } }
  | { type: "message_stop" }
  | { type: "completion"; completion: string; stop_reason: string | null; model: string };

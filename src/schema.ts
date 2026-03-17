import { z } from "zod";

const providerKind = z.enum(["openai", "anthropic", "openrouter"]);

export const daemonSchema = z.object({
  host: z.string().min(1).default("127.0.0.1"),
  port: z.number().int().min(1).max(65535).default(4317)
});

export const providerSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  apiKey: z.string().min(1),
  baseUrl: z.string().url().optional()
});

export const routeTargetSchema = z.object({
  provider: providerKind,
  model: z.string().min(1)
});

export const aliasRouteSchema = z.object({
  primary: routeTargetSchema,
  fallbacks: z.array(routeTargetSchema).default([]),
  capabilities: z.array(z.enum(["chat", "embeddings"])).min(1)
});

export const projectTokenSchema = z.object({
  token: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const configSchema = z.object({
  daemon: daemonSchema.default({ host: "127.0.0.1", port: 4317 }),
  providers: z.record(z.string(), providerSettingsSchema).default({}),
  aliases: z.record(z.string(), aliasRouteSchema).default({}),
  tokens: z.record(z.string(), projectTokenSchema).default({})
});

export type ConfigInput = z.input<typeof configSchema>;

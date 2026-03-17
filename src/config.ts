import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { configSchema } from "./schema.js";
import type {
  AliasRoute,
  ProviderKind,
  ProviderSettings,
  ProjectToken,
  RoundaboutConfig
} from "./types.js";

const DEFAULT_CONFIG: RoundaboutConfig = {
  daemon: {
    host: "127.0.0.1",
    port: 4317
  },
  providers: {},
  aliases: {},
  tokens: {}
};

export function getConfigPath() {
  return join(homedir(), ".roundabout", "config.json");
}

export async function ensureConfigDir(configPath = getConfigPath()) {
  await mkdir(dirname(configPath), { recursive: true });
}

export async function loadConfig(configPath = getConfigPath()): Promise<RoundaboutConfig> {
  try {
    const raw = await readFile(configPath, "utf8");
    return configSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return structuredClone(DEFAULT_CONFIG);
    }
    throw error;
  }
}

export async function saveConfig(config: RoundaboutConfig, configPath = getConfigPath()) {
  await ensureConfigDir(configPath);
  const normalized = configSchema.parse(config);
  await writeFile(configPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}

export function upsertProvider(
  config: RoundaboutConfig,
  provider: ProviderKind,
  settings: ProviderSettings
) {
  config.providers[provider] = settings;
}

export function upsertAlias(config: RoundaboutConfig, alias: string, route: AliasRoute) {
  config.aliases[alias] = route;
}

export function upsertToken(config: RoundaboutConfig, name: string, tokenValue: string) {
  const now = new Date().toISOString();
  const current = config.tokens[name];
  const token: ProjectToken = {
    token: tokenValue,
    createdAt: current?.createdAt ?? now,
    updatedAt: now
  };
  config.tokens[name] = token;
}

export function summarizeProviders(config: RoundaboutConfig) {
  return (Object.entries(config.providers) as Array<[ProviderKind, ProviderSettings]>).map(
    ([provider, settings]) => ({
      provider,
      enabled: settings.enabled
    })
  );
}

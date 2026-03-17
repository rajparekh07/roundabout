import { Command } from "commander";
import { confirm, input, password, select } from "@inquirer/prompts";

import { getConfigPath, loadConfig, saveConfig, summarizeProviders, upsertAlias, upsertProvider, upsertToken } from "./config.js";
import { createDebugLogger } from "./debug.js";
import { createServer, startServer } from "./server.js";
import { generateToken } from "./token.js";
import type { AliasRoute, ProviderKind, RoundaboutConfig } from "./types.js";

const PROVIDERS: Array<{ value: ProviderKind; label: string }> = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openrouter", label: "OpenRouter" }
];

export function createCli() {
  const program = new Command();

  program
    .name("roundabout")
    .description("Local OpenAI-compatible LLM proxy")
    .version("0.1.0");

  program
    .command("setup")
    .description("Run the initial setup wizard")
    .option("--config <path>", "Override config path")
    .action(async (options) => {
      const configPath = options.config ?? getConfigPath();
      const config = await loadConfig(configPath);
      const updated = await runSetupWizard(config);
      await saveConfig(updated, configPath);
      console.log(`Wrote config to ${configPath}`);
    });

  program
    .command("start")
    .description("Start the local daemon")
    .option("--config <path>", "Override config path")
    .option("--debug", "Log request and response bodies to stderr")
    .action(async (options) => {
      const configPath = options.config ?? getConfigPath();
      const config = await loadConfig(configPath);
      const logger = createDebugLogger(Boolean(options.debug));
      const app = await startServer(config, undefined, logger);
      console.log(`roundabout listening on http://${config.daemon.host}:${config.daemon.port}`);
      if (options.debug) {
        console.log("debug logging enabled");
      }
      for (const signal of ["SIGINT", "SIGTERM"] as const) {
        process.on(signal, async () => {
          await app.close();
          process.exit(0);
        });
      }
    });

  const token = program.command("token").description("Manage local project tokens");

  token
    .command("create")
    .description("Create a new token for a project")
    .argument("<project>", "Project name")
    .option("--config <path>", "Override config path")
    .action(async (project, options) => {
      const configPath = options.config ?? getConfigPath();
      const config = await loadConfig(configPath);
      const value = generateToken();
      upsertToken(config, project, value);
      await saveConfig(config, configPath);
      console.log(`${project}: ${value}`);
    });

  token
    .command("rotate")
    .description("Rotate an existing token")
    .argument("<project>", "Project name")
    .option("--config <path>", "Override config path")
    .action(async (project, options) => {
      const configPath = options.config ?? getConfigPath();
      const config = await loadConfig(configPath);
      const value = generateToken();
      upsertToken(config, project, value);
      await saveConfig(config, configPath);
      console.log(`${project}: ${value}`);
    });

  token
    .command("list")
    .description("List configured projects")
    .option("--config <path>", "Override config path")
    .action(async (options) => {
      const configPath = options.config ?? getConfigPath();
      const config = await loadConfig(configPath);
      const rows = Object.entries(config.tokens).map(([project, tokenEntry]) => ({
        project,
        updatedAt: tokenEntry.updatedAt,
        tokenPreview: `${tokenEntry.token.slice(0, 10)}...`
      }));
      console.table(rows);
    });

  program
    .command("status")
    .description("Show config summary and daemon health")
    .option("--config <path>", "Override config path")
    .action(async (options) => {
      const configPath = options.config ?? getConfigPath();
      const config = await loadConfig(configPath);
      const summary = {
        configPath,
        daemon: `http://${config.daemon.host}:${config.daemon.port}`,
        providers: summarizeProviders(config),
        aliasCount: Object.keys(config.aliases).length,
        tokenCount: Object.keys(config.tokens).length,
        health: await checkHealth(config)
      };
      console.log(JSON.stringify(summary, null, 2));
    });

  return program;
}

async function runSetupWizard(config: RoundaboutConfig) {
  const host = await input({
    message: "Daemon host",
    default: config.daemon.host
  });
  const port = await input({
    message: "Daemon port",
    default: String(config.daemon.port),
    validate(value) {
      const parsed = Number(value);
      return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? true : "Enter a valid port";
    }
  });

  config.daemon.host = host;
  config.daemon.port = Number(port);

  for (const provider of PROVIDERS) {
    const enabled = await confirm({
      message: `Enable ${provider.label}?`,
      default: Boolean(config.providers[provider.value]?.enabled)
    });

    if (!enabled) {
      continue;
    }

    const apiKey = await password({
      message: `${provider.label} API key`,
      mask: "*"
    });

    upsertProvider(config, provider.value, {
      enabled: true,
      apiKey
    });
  }

  const shouldSeedAliases = await confirm({
    message: "Create default aliases?",
    default: Object.keys(config.aliases).length === 0
  });

  if (shouldSeedAliases) {
    await seedAliases(config);
  }

  const defaultProject = await input({
    message: "Create an initial project token for",
    default: "default"
  });
  upsertToken(config, defaultProject, generateToken());

  return config;
}

async function seedAliases(config: RoundaboutConfig) {
  const smartProvider = await chooseProvider("Provider for smart alias", config);
  const smartModel = await input({
    message: `Model name for smart (${smartProvider})`,
    default: smartProvider === "anthropic" ? "claude-3-7-sonnet-latest" : "gpt-4.1-mini"
  });
  const fastProvider = await chooseProvider("Provider for fast alias", config);
  const fastModel = await input({
    message: `Model name for fast (${fastProvider})`,
    default: fastProvider === "openrouter" ? "openai/gpt-4.1-mini" : "gpt-4.1-mini"
  });
  const embedProvider = await chooseProvider("Provider for embed alias", config, ["openai", "openrouter"]);
  const embedModel = await input({
    message: `Model name for embed (${embedProvider})`,
    default: embedProvider === "openrouter" ? "text-embedding-3-small" : "text-embedding-3-small"
  });

  const smartFallback = await chooseOptionalFallback("Fallback for smart alias", config, smartProvider);
  const fastFallback = await chooseOptionalFallback("Fallback for fast alias", config, fastProvider);
  const embedFallback = await chooseOptionalFallback("Fallback for embed alias", config, embedProvider, [
    "openai",
    "openrouter"
  ]);

  const aliases: Record<string, AliasRoute> = {
    smart: {
      primary: { provider: smartProvider, model: smartModel },
      fallbacks: smartFallback ? [smartFallback] : [],
      capabilities: ["chat"]
    },
    fast: {
      primary: { provider: fastProvider, model: fastModel },
      fallbacks: fastFallback ? [fastFallback] : [],
      capabilities: ["chat"]
    },
    embed: {
      primary: { provider: embedProvider, model: embedModel },
      fallbacks: embedFallback ? [embedFallback] : [],
      capabilities: ["embeddings"]
    }
  };

  for (const [alias, route] of Object.entries(aliases)) {
    upsertAlias(config, alias, route);
  }
}

async function chooseProvider(
  message: string,
  config: RoundaboutConfig,
  allowed?: ProviderKind[]
): Promise<ProviderKind> {
  const enabledProviders = PROVIDERS.filter(
    (provider) => config.providers[provider.value]?.enabled && (!allowed || allowed.includes(provider.value))
  );
  if (enabledProviders.length === 0) {
    throw new Error("No enabled providers available for alias setup");
  }

  return select({
    message,
    choices: enabledProviders.map((provider) => ({
      value: provider.value,
      name: provider.label
    }))
  });
}

async function chooseOptionalFallback(
  message: string,
  config: RoundaboutConfig,
  excluded: ProviderKind,
  allowed?: ProviderKind[]
) {
  const options = PROVIDERS.filter(
    (provider) =>
      provider.value !== excluded &&
      config.providers[provider.value]?.enabled &&
      (!allowed || allowed.includes(provider.value))
  );

  if (options.length === 0) {
    return null;
  }

  const selection = await select({
    message,
    choices: [
      { value: "__none__", name: "No fallback" },
      ...options.map((option) => ({ value: option.value, name: option.label }))
    ]
  });

  if (selection === "__none__") {
    return null;
  }

  const model = await input({
    message: `Fallback model for ${selection}`,
    default: selection === "anthropic" ? "claude-3-5-haiku-latest" : "gpt-4.1-mini"
  });

  return {
    provider: selection as ProviderKind,
    model
  };
}

async function checkHealth(config: RoundaboutConfig) {
  try {
    const app = createServer(config);
    await app.ready();
    await app.close();
    const response = await fetch(`http://${config.daemon.host}:${config.daemon.port}/healthz`);
    if (!response.ok) {
      return "unreachable";
    }
    const body = (await response.json()) as { ok: boolean };
    return body.ok ? "running" : "unreachable";
  } catch {
    return "not running";
  }
}

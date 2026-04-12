import { Command } from "commander";
import { confirm, input, password, select } from "@inquirer/prompts";

import { buildCliDependencies } from "./bootstrap/build-cli.js";
import { createDebugLogger } from "./debug.js";
import { getProviderLabel } from "./providers/metadata.js";
import type { ProviderDescriptorRegistry } from "./providers/provider-descriptor.js";
import { startServerWithDependencies } from "./server.js";
import { generateToken } from "./token.js";
import type { CliDependencies } from "./core/contracts.js";
import type { AliasRoute, ProviderCapability, ProviderName, ProviderProtocol, RoundaboutConfig } from "./types.js";

export function createCli() {
  const program = new Command();

  program
    .name("roundabout")
    .description("Local OpenAI-compatible LLM proxy")
    .version("1.0.0");

  program
    .command("setup")
    .description("Run the initial setup wizard")
    .option("--config <path>", "Override config path")
    .action(async (options) => {
      const dependencies = await buildCliDependencies(options.config);
      const config = await dependencies.configurationService.load();
      const updated = await runSetupWizard(config, dependencies);
      await dependencies.configurationService.save(updated);
      console.log(`Wrote config to ${dependencies.configurationService.getPath()}`);
    });

  program
    .command("start")
    .description("Start the local daemon")
    .option("--config <path>", "Override config path")
    .option("--debug", "Log request and response bodies to stderr")
    .action(async (options) => {
      const dependencies = await buildCliDependencies(options.config);
      const logger = createDebugLogger(Boolean(options.debug));
      const serverDependencies = await dependencies.startDependencies(logger);
      const app = await startServerWithDependencies(serverDependencies);

      console.log(
        `roundabout listening on http://${serverDependencies.config.daemon.host}:${serverDependencies.config.daemon.port}`
      );
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
      const dependencies = await buildCliDependencies(options.config);
      const value = await dependencies.tokenAdminService.create(project);
      console.log(`${project}: ${value}`);
    });

  token
    .command("rotate")
    .description("Rotate an existing token")
    .argument("<project>", "Project name")
    .option("--config <path>", "Override config path")
    .action(async (project, options) => {
      const dependencies = await buildCliDependencies(options.config);
      const value = await dependencies.tokenAdminService.rotate(project);
      console.log(`${project}: ${value}`);
    });

  token
    .command("list")
    .description("List configured projects")
    .option("--config <path>", "Override config path")
    .action(async (options) => {
      const dependencies = await buildCliDependencies(options.config);
      const rows = await dependencies.tokenAdminService.list();
      console.table(rows);
    });

  program
    .command("status")
    .description("Show config summary and daemon health")
    .option("--config <path>", "Override config path")
    .action(async (options) => {
      const dependencies = await buildCliDependencies(options.config);
      console.log(JSON.stringify(await dependencies.statusService.summary(), null, 2));
    });

  return program;
}

async function runSetupWizard(config: RoundaboutConfig, dependencies: CliDependencies) {
  const registry = dependencies.descriptorRegistry;

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

  for (const descriptor of registry.list()) {
    const enabled = await confirm({
      message: `Enable ${descriptor.label}?`,
      default: Boolean(config.providers[descriptor.name]?.enabled)
    });

    if (!enabled) {
      continue;
    }

    const apiKey = await password({
      message: `${descriptor.label} API key`,
      mask: "*"
    });

    dependencies.configurationService.setProvider(config, descriptor.name, {
      enabled: true,
      protocol: descriptor.capabilities.has("anthropic-native") ? "anthropic" : "openai",
      apiKey
    });
  }

  while (
    await confirm({
      message: "Add a custom provider?",
      default: false
    })
  ) {
    const name = await input({
      message: "Custom provider name",
      validate(value) {
        return value.trim().length > 0 ? true : "Enter a provider name";
      }
    });
    const protocol = await select<ProviderProtocol>({
      message: `API protocol for ${name}`,
      choices: [
        { value: "openai", name: "OpenAI-compatible" },
        { value: "anthropic", name: "Anthropic-compatible" }
      ]
    });
    const apiKey = await password({
      message: `${name} API key`,
      mask: "*"
    });
    const baseUrl = await input({
      message: `${name} base URL`,
      validate(value) {
        if (!value || isValidUrl(value)) {
          return true;
        }
        return "Enter a valid URL";
      }
    });

    dependencies.configurationService.setProvider(config, name, {
      enabled: true,
      protocol,
      apiKey,
      ...(baseUrl ? { baseUrl } : {})
    });
  }

  const shouldSeedAliases = await confirm({
    message: "Create default aliases?",
    default: Object.keys(config.aliases).length === 0
  });

  if (shouldSeedAliases) {
    await seedAliases(config, dependencies);
  }

  const defaultProject = await input({
    message: "Create an initial project token for",
    default: "default"
  });
  dependencies.configurationService.setToken(config, defaultProject, generateToken());

  return config;
}

async function seedAliases(config: RoundaboutConfig, dependencies: CliDependencies) {
  const registry = dependencies.descriptorRegistry;

  const smartProvider = await chooseProvider("Provider for smart alias", config, registry);
  const smartModel = await input({
    message: `Model name for smart (${smartProvider})`,
    default: defaultModelForProvider(config, smartProvider, "chat")
  });
  const fastProvider = await chooseProvider("Provider for fast alias", config, registry);
  const fastModel = await input({
    message: `Model name for fast (${fastProvider})`,
    default: defaultModelForProvider(config, fastProvider, "chat")
  });
  const embedProvider = await chooseProvider("Provider for embed alias", config, registry, {
    capabilities: ["embeddings"]
  });
  const embedModel = await input({
    message: `Model name for embed (${embedProvider})`,
    default: "text-embedding-3-small"
  });

  const smartFallback = await chooseOptionalFallback("Fallback for smart alias", config, smartProvider, registry);
  const fastFallback = await chooseOptionalFallback("Fallback for fast alias", config, fastProvider, registry);
  const embedFallback = await chooseOptionalFallback("Fallback for embed alias", config, embedProvider, registry, {
    capabilities: ["embeddings"]
  });

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
    dependencies.configurationService.setAlias(config, alias, route);
  }
}

async function chooseProvider(
  message: string,
  config: RoundaboutConfig,
  registry: ProviderDescriptorRegistry,
  options?: {
    capabilities?: ProviderCapability[];
  }
): Promise<ProviderName> {
  const enabledProviders = Object.entries(config.providers).filter(([name, settings]) => {
    if (!settings.enabled) {
      return false;
    }
    if (!options?.capabilities) {
      return true;
    }
    const descriptor = registry.resolve(name, settings.protocol);
    return options.capabilities.every((cap) => descriptor.capabilities.has(cap));
  });
  if (enabledProviders.length === 0) {
    throw new Error("No enabled providers available for alias setup");
  }

  return select({
    message,
    choices: enabledProviders.map(([provider]) => ({
      value: provider,
      name: getProviderLabel(registry, provider)
    }))
  });
}

async function chooseOptionalFallback(
  message: string,
  config: RoundaboutConfig,
  excluded: ProviderName,
  registry: ProviderDescriptorRegistry,
  options?: {
    capabilities?: ProviderCapability[];
  }
) {
  const availableProviders = Object.entries(config.providers).filter(([provider, settings]) => {
    if (provider === excluded || !settings.enabled) {
      return false;
    }
    if (!options?.capabilities) {
      return true;
    }
    const descriptor = registry.resolve(provider, settings.protocol);
    return options.capabilities.every((cap) => descriptor.capabilities.has(cap));
  });

  if (availableProviders.length === 0) {
    return null;
  }

  const selection = await select({
    message,
    choices: [
      { value: "__none__", name: "No fallback" },
      ...availableProviders.map(([provider]) => ({ value: provider, name: getProviderLabel(registry, provider) }))
    ]
  });

  if (selection === "__none__") {
    return null;
  }

  const model = await input({
    message: `Fallback model for ${selection}`,
    default: defaultModelForProvider(config, selection, "fallback")
  });

  return {
    provider: selection,
    model
  };
}

function defaultModelForProvider(
  config: RoundaboutConfig,
  provider: ProviderName,
  mode: "chat" | "fallback"
) {
  const settings = config.providers[provider];
  if (settings?.protocol === "anthropic") {
    return mode === "fallback" ? "claude-3-5-haiku-latest" : "claude-sonnet-4-0";
  }

  if (provider === "openrouter") {
    return mode === "fallback" ? "openai/gpt-5.4-mini" : "openai/gpt-5.4";
  }

  return mode === "fallback" ? "gpt-5.4-mini" : "gpt-5.4";
}

function isValidUrl(value: string) {
  return value.startsWith("https");
}

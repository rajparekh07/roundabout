import { createDebugLogger } from "../debug.js";
import type { CliDependencies } from "../core/contracts.js";
import { FileConfigRepository } from "../features/config/file-config-repository.js";
import { ConfigurationService } from "../features/config/configuration-service.js";
import { TokenAdminService } from "../features/auth/token-admin-service.js";
import { StatusService } from "../features/status/status-service.js";
import { buildAppContainer } from "./build-app.js";

export async function buildCliDependencies(configPath?: string): Promise<CliDependencies> {
  const configRepository = new FileConfigRepository(configPath);
  const configurationService = new ConfigurationService(configRepository);
  const tokenAdminService = new TokenAdminService(configRepository);
  const statusService = new StatusService(configRepository);

  return {
    configRepository,
    configurationService,
    tokenAdminService,
    statusService,
    startDependencies: async (logger = createDebugLogger(false)) => {
      const config = await configRepository.load();
      return buildAppContainer(config, undefined, logger);
    }
  };
}

import { InMemoryTokenRepository } from "./core/repositories.js";
import { TokenAuthService } from "./features/auth/token-auth-service.js";
import type { RoundaboutConfig } from "./types.js";

export function validateBearerToken(
  authorizationHeader: string | undefined,
  config: RoundaboutConfig
) {
  return buildTokenAuthService(config).validate({
    authorization: authorizationHeader
  });
}

export function validateApiToken(
  headers: { authorization?: string; "x-api-key"?: string },
  config: RoundaboutConfig
) {
  return buildTokenAuthService(config).validate(headers);
}

function buildTokenAuthService(config: RoundaboutConfig) {
  return new TokenAuthService(new InMemoryTokenRepository(config));
}

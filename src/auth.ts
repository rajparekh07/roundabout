import type { RoundaboutConfig } from "./types.js";

function lookupToken(supplied: string | undefined, config: RoundaboutConfig) {
  if (!supplied) {
    return null;
  }
  const entry = Object.entries(config.tokens).find(([, token]) => token.token === supplied);
  if (!entry) {
    return null;
  }

  return {
    project: entry[0]
  };
}

export function validateBearerToken(
  authorizationHeader: string | undefined,
  config: RoundaboutConfig
) {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }

  return lookupToken(authorizationHeader.slice("Bearer ".length).trim(), config);
}

export function validateApiToken(
  headers: { authorization?: string; "x-api-key"?: string },
  config: RoundaboutConfig
) {
  const bearer = validateBearerToken(headers.authorization, config);
  if (bearer) {
    return bearer;
  }
  return lookupToken(headers["x-api-key"], config);
}

import type { TokenRepository } from "../../core/contracts.js";

export class TokenAuthService {
  constructor(private readonly tokens: TokenRepository) {}

  validate(headers: { authorization?: string; "x-api-key"?: string }) {
    const bearer = this.validateBearer(headers.authorization);
    if (bearer) {
      return bearer;
    }

    if (!headers["x-api-key"]) {
      return null;
    }

    const project = this.tokens.findProjectByToken(headers["x-api-key"]);
    return project ? { project } : null;
  }

  private validateBearer(header: string | undefined) {
    if (!header?.startsWith("Bearer ")) {
      return null;
    }

    const token = header.slice("Bearer ".length).trim();
    const project = this.tokens.findProjectByToken(token);
    return project ? { project } : null;
  }
}

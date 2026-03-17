import { ProxyError } from "../errors.js";
import type { RouteTarget } from "../types.js";

export class FallbackExecutor {
  async execute<T>(targets: RouteTarget[], fn: (target: RouteTarget) => Promise<T>) {
    let lastError: unknown;

    for (const target of targets) {
      try {
        return await fn(target);
      } catch (error) {
        lastError = error;
        if (!(error instanceof ProxyError) || !error.retriable) {
          throw error;
        }
      }
    }

    throw lastError ?? new ProxyError("All providers failed", {
      statusCode: 502,
      code: "all_targets_failed",
      retriable: true
    });
  }
}

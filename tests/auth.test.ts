import { describe, expect, it } from "vitest";

import { validateBearerToken } from "../src/auth.js";
import type { RoundaboutConfig } from "../src/types.js";

const config: RoundaboutConfig = {
  daemon: { host: "127.0.0.1", port: 4317 },
  providers: {},
  aliases: {},
  tokens: {
    app: {
      token: "rb_secret",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z"
    }
  }
};

describe("auth", () => {
  it("accepts a valid bearer token", () => {
    expect(validateBearerToken("Bearer rb_secret", config)).toEqual({ project: "app" });
  });

  it("rejects missing bearer tokens", () => {
    expect(validateBearerToken(undefined, config)).toBeNull();
  });
});

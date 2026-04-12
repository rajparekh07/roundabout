import { writeFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { loadConfig, saveConfig, upsertAlias, upsertProvider, upsertToken } from "../src/config.js";
import { resolveAlias } from "../src/routing.js";
import { withTempDir } from "./helpers.js";

describe("config", () => {
  it("loads defaults when the config file is absent", async () => {
    await withTempDir(async (dir) => {
      const config = await loadConfig(`${dir}/config.json`);
      expect(config.daemon.port).toBe(4317);
      expect(config.aliases).toEqual({});
    });
  });

  it("persists providers aliases and tokens", async () => {
    await withTempDir(async (dir) => {
      const path = `${dir}/config.json`;
      const config = await loadConfig(path);
      upsertProvider(config, "openai", {
        enabled: true,
        protocol: "openai",
        apiKey: "sk-openai"
      });
      upsertAlias(config, "smart", {
        primary: { provider: "openai", model: "gpt-4.1-mini" },
        fallbacks: [],
        capabilities: ["chat"]
      });
      upsertToken(config, "app", "rb_123");
      await saveConfig(config, path);

      const reloaded = await loadConfig(path);
      expect(resolveAlias(reloaded, "smart", "chat").primary.model).toBe("gpt-4.1-mini");
      expect(reloaded.tokens.app.token).toBe("rb_123");
    });
  });

  it("normalizes legacy apiType to protocol for built-in providers", async () => {
    await withTempDir(async (dir) => {
      const path = `${dir}/config.json`;
      await writeFile(
        path,
        JSON.stringify({
          daemon: { host: "127.0.0.1", port: 4317 },
          providers: {
            openrouter: {
              enabled: true,
              apiKey: "sk-openrouter"
            }
          },
          aliases: {},
          tokens: {}
        })
      );

      const config = await loadConfig(path);
      expect(config.providers.openrouter?.protocol).toBe("openai");
    });
  });

  it("defaults custom providers without protocol to openai", async () => {
    await withTempDir(async (dir) => {
      const path = `${dir}/config.json`;
      await writeFile(
        path,
        JSON.stringify({
          daemon: { host: "127.0.0.1", port: 4317 },
          providers: {
            gateway: {
              enabled: true,
              apiKey: "sk-gateway"
            }
          },
          aliases: {},
          tokens: {}
        })
      );

      const config = await loadConfig(path);
      expect(config.providers.gateway?.protocol).toBe("openai");
    });
  });
});

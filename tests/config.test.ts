import { writeFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { loadConfig, saveConfig, upsertModel, upsertProvider, upsertToken } from "../src/config.js";
import { withTempDir } from "./helpers.js";

describe("config", () => {
  it("loads defaults when the config file is absent", async () => {
    await withTempDir(async (dir) => {
      const config = await loadConfig(`${dir}/config.json`);
      expect(config.daemon.port).toBe(4317);
      expect(config.models).toEqual({});
    });
  });

  it("persists providers models and tokens", async () => {
    await withTempDir(async (dir) => {
      const path = `${dir}/config.json`;
      const config = await loadConfig(path);
      upsertProvider(config, "openai", {
        enabled: true,
        protocol: "openai",
        apiKey: "sk-openai"
      });
      upsertModel(config, "smart", {
        providers: [{ provider: "openai", model: "gpt-4.1-mini" }],
        capabilities: ["chat"]
      });
      upsertToken(config, "app", "rb_123");
      await saveConfig(config, path);

      const reloaded = await loadConfig(path);
      expect(reloaded.models.smart?.providers[0]?.model).toBe("gpt-4.1-mini");
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
          models: {},
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
          models: {},
          tokens: {}
        })
      );

      const config = await loadConfig(path);
      expect(config.providers.gateway?.protocol).toBe("openai");
    });
  });

  it("rejects legacy top-level aliases config", async () => {
    await withTempDir(async (dir) => {
      const path = `${dir}/config.json`;
      await writeFile(
        path,
        JSON.stringify({
          daemon: { host: "127.0.0.1", port: 4317 },
          providers: {},
          aliases: { smart: { primary: { provider: "openai", model: "gpt-4" }, fallbacks: [], capabilities: ["chat"] } },
          tokens: {}
        })
      );

      await expect(loadConfig(path)).rejects.toThrow();
    });
  });

  it("rejects legacy per-model primary/fallbacks shape", async () => {
    await withTempDir(async (dir) => {
      const path = `${dir}/config.json`;
      await writeFile(
        path,
        JSON.stringify({
          daemon: { host: "127.0.0.1", port: 4317 },
          providers: {},
          models: { smart: { primary: { provider: "openai", model: "gpt-4" }, fallbacks: [], capabilities: ["chat"] } },
          tokens: {}
        })
      );

      await expect(loadConfig(path)).rejects.toThrow();
    });
  });

  it("resolves omitted provider model to parent model key", async () => {
    await withTempDir(async (dir) => {
      const path = `${dir}/config.json`;
      const config = await loadConfig(path);
      upsertProvider(config, "openai", {
        enabled: true,
        protocol: "openai",
        apiKey: "sk-openai"
      });
      upsertModel(config, "glm5.4", {
        providers: [
          { provider: "openrouter", model: "openai/gpt-5.4" },
          { provider: "openai" }
        ],
        capabilities: ["chat"]
      });
      await saveConfig(config, path);

      const reloaded = await loadConfig(path);
      const route = reloaded.models["glm5.4"];
      expect(route?.providers[0]?.model).toBe("openai/gpt-5.4");
      expect(route?.providers[1]?.model).toBeUndefined();
    });
  });
});
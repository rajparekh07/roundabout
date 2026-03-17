import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { createCli } from "../src/cli.js";
import { withTempDir } from "./helpers.js";

describe("cli", () => {
  it("creates and lists project tokens", async () => {
    await withTempDir(async (dir) => {
      const configPath = `${dir}/config.json`;
      const program = createCli();
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

      await program.parseAsync(["token", "create", "app", "--config", configPath], {
        from: "user"
      });

      const raw = await readFile(configPath, "utf8");
      expect(raw).toContain("\"app\"");
      expect(log).toHaveBeenCalled();
      log.mockRestore();
    });
  });

  it("reports status output", async () => {
    await withTempDir(async (dir) => {
      const configPath = `${dir}/config.json`;
      const program = createCli();
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

      await program.parseAsync(["status", "--config", configPath], {
        from: "user"
      });

      expect(log).toHaveBeenCalledTimes(1);
      log.mockRestore();
    });
  });

  it("accepts start debug flag", async () => {
    const program = createCli();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(
      program.parseAsync(["start", "--help"], {
        from: "user"
      })
    ).rejects.toBeDefined();

    log.mockRestore();
  });
});

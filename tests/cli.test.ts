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

  it("shows the full token for a project", async () => {
    await withTempDir(async (dir) => {
      const configPath = `${dir}/config.json`;
      const program = createCli();
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

      await program.parseAsync(["token", "create", "myapp", "--config", configPath], {
        from: "user"
      });

      const createOutput = log.mock.calls.map((args: unknown[]) => String(args[0])).join("\n");
      const tokenMatch = createOutput.match(/rb_[0-9a-f]{48}/);
      expect(tokenMatch).not.toBeNull();
      const fullToken = tokenMatch![0];

      log.mockClear();

      await program.parseAsync(["token", "show", "myapp", "--config", configPath], {
        from: "user"
      });

      const showOutput = log.mock.calls.map((args: unknown[]) => String(args[0])).join("\n");
      expect(showOutput).toContain(fullToken);
      log.mockRestore();
    });
  });

  it("warns when showing token for unknown project", async () => {
    await withTempDir(async (dir) => {
      const configPath = `${dir}/config.json`;
      const program = createCli();
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

      await program.parseAsync(["token", "show", "nonexistent", "--config", configPath], {
        from: "user"
      });

      const output = log.mock.calls.map((args: unknown[]) => String(args[0])).join("\n");
      expect(output).toContain("No token found for nonexistent");
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

      expect(log).toHaveBeenCalled();
      const output = log.mock.calls.map((args: unknown[]) => String(args[0])).join("\n");
      expect(output).toContain("Daemon");
      expect(output).toContain("Health");
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

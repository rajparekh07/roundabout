import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function getVersion(): string {
  for (const path of ["../package.json", "../../package.json"]) {
    try {
      const pkg = require(path) as { version?: unknown };
      if (typeof pkg.version === "string") {
        return pkg.version;
      }
    } catch {}
  }

  return "0.0.0";
}

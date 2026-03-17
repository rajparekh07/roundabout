#!/usr/bin/env node

import { createCli } from "./cli.js";

const program = createCli();
program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

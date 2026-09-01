#!/usr/bin/env node

import { runCli } from './cli.js';
import { parseArguments } from './arguments.js';
import { VERSION } from './config.js';
import {
  shouldAutoUpdate,
} from './update-check.js';
import { renderAutomaticUpdate, updateCli } from './update.js';

const argv = process.argv.slice(2);
try {
  const parsed = parseArguments(argv, process.env);
  const command = parsed.rest[0];
  if (
    command &&
    command !== 'help' &&
    command !== 'update' &&
    !parsed.globals.version &&
    shouldAutoUpdate(process.env, parsed.globals.noUpdate)
  ) {
    const result = await updateCli({
      currentVersion: VERSION,
      env: process.env,
      ...(process.argv[1] ? { executablePath: process.argv[1] } : {}),
      automatic: true,
    });
    const notice = renderAutomaticUpdate(result);
    if (notice) process.stderr.write(notice);
  }
} catch (error) {
  process.stderr.write(
    `Warning: auto-update failed; continuing with v${VERSION}. ` +
    (error instanceof Error ? error.message : '') +
    '\n'
  );
}

process.exitCode = await runCli(argv);

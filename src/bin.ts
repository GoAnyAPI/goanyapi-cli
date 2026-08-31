#!/usr/bin/env node

import { runCli } from './cli.js';
import { VERSION } from './config.js';
import {
  checkForUpdate,
  renderUpdateNotice,
  shouldCheckForUpdates,
} from './update-check.js';

const updateNotice = shouldCheckForUpdates(process.env, Boolean(process.stderr.isTTY))
  ? checkForUpdate({ currentVersion: VERSION }).then((update) => {
      if (update) process.stderr.write(renderUpdateNotice(update));
    })
  : Promise.resolve();

process.exitCode = await runCli(process.argv.slice(2));
await updateNotice;

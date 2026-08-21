#!/usr/bin/env node

/**
 * @nymrel/agent-beacon
 * Executable CLI entrypoint.
 * Copyright (c) 2026 Nymrel / JalenBuilds LLC. MIT Licensed.
 */

import { runCli } from '../dist/cli.js';

runCli().catch((err) => {
  console.error('\x1b[31m[Agent Beacon Error]\x1b[0m', err instanceof Error ? err.message : String(err));
  process.exit(1);
});

/**
 * @nymrel/agent-beacon
 * Command-line interface for running beacon daemon, querying fleet, and wrapping processes.
 * Copyright (c) 2026 Nymrel / JalenBuilds LLC. MIT Licensed.
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import process from 'node:process';
import { normalizeHttpBaseUrl, requireHttpUrl } from './utils/http-url.js';
import { ConsoleNotifier } from './notifiers/console.js';
import { DiscordNotifier } from './notifiers/discord.js';
import { SlackNotifier } from './notifiers/slack.js';
import { TelegramNotifier } from './notifiers/telegram.js';
import { WebhookNotifier } from './notifiers/webhook.js';
import { HeartbeatServer } from './server/heartbeat-server.js';
import { FleetSummary, Notifier } from './core/types.js';

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const command = argv[0];

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    printHelp();
    return;
  }

  if (command === '--version' || command === '-v' || command === 'version') {
    console.log('@nymrel/agent-beacon v1.0.0');
    return;
  }

  const args = parseArgs(argv.slice(1));

  switch (command) {
    case 'server':
      await handleServerCommand(args);
      break;
    case 'ping':
      await handlePingCommand(args);
      break;
    case 'done':
    case 'retire':
      await handleDoneCommand(args);
      break;
    case 'status':
    case 'health':
      await handleStatusCommand(args);
      break;
    case 'watch':
      await handleWatchCommand(args, argv.slice(1));
      break;
    default:
      console.error(`Unknown command: "${command}". Run "agent-beacon --help" for available commands.`);
      process.exit(1);
  }
}

function printHelp(): void {
  console.log(`
\x1b[1m\x1b[36mAGENT BEACON\x1b[0m — Liveness Sentinel & Watchdog Mesh for AI Agents
\x1b[90mCopyright (c) 2026 Nymrel / JalenBuilds LLC. MIT Licensed.\x1b[0m

\x1b[1mUSAGE:\x1b[0m
  $ agent-beacon <command> [options]

\x1b[1mCOMMANDS:\x1b[0m
  \x1b[32mserver\x1b[0m                 Start standalone beacon sentinel daemon
  \x1b[32mping\x1b[0m                   Send a one-shot heartbeat ping for an agent
  \x1b[32mdone\x1b[0m                   Gracefully unregister/retire a finished agent
  \x1b[32mstatus\x1b[0m                 Display fleet liveness and dead-man's switch status
  \x1b[32mwatch\x1b[0m                  Wrap a command with background heartbeats and exit reporting

\x1b[1mSERVER OPTIONS:\x1b[0m
  --port, -p <number>     HTTP port (default: 8765)
  --udp, -u <number>      UDP port (default: 8766, 'false' to disable)
  --host, -h <string>     Bind address (default: '127.0.0.1')
  --ttl <seconds>         Default agent TTL (default: 30)
  --grace <seconds>       Default grace window (default: 15)
  --discord <url>         Discord incoming webhook URL for alerts
  --slack <url>           Slack incoming webhook URL for alerts
  --telegram <token:chat> Telegram bot token & chat ID for alerts
  --webhook <url>         Generic JSON webhook URL
  --no-bell               Disable audible console beep on dead-man triggers

\x1b[1mPING / DONE OPTIONS:\x1b[0m
  --id, -i <agentId>      Unique agent identifier (required)
  --name, -n <name>       Human-readable agent name
  --url <beaconUrl>       Beacon server URL (default: http://127.0.0.1:8765)
  --ttl <seconds>         Heartbeat TTL interval
  --status <ok|degraded>  Internal status report (default: ok)
  --tag <key=value>       Attach arbitrary tag (repeatable)
  --reason <text>         Deregistration reason message

\x1b[1mEXAMPLES:\x1b[0m
  # Start daemon with Discord alerting
  $ agent-beacon server --port 8765 --discord https://discord.com/api/webhooks/...

  # Send one-shot heartbeat from a bash script
  $ agent-beacon ping --id sol-worker-1 --tag env=prod

  # Wrap a long-running agent command with auto-heartbeats
  $ agent-beacon watch --id python-eval-worker -- python run_evals.py
`);
}

function parseArgs(args: string[]): Record<string, any> {
  const result: Record<string, any> = { _: [] };
  const tags: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--') {
      result._rawCommand = args.slice(i + 1);
      break;
    }

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (key === 'no-bell') {
        result.noBell = true;
        continue;
      }
      if (key === 'json') {
        result.json = true;
        continue;
      }
      if (key === 'watch') {
        result.watch = true;
        continue;
      }

      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        if (key === 'tag') {
          const [k, v] = next.split('=');
          if (k) tags[k] = v ?? '';
        } else {
          result[key] = next;
        }
        i++;
      } else {
        result[key] = true;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        result[key] = next;
        i++;
      } else {
        result[key] = true;
      }
    } else {
      result._.push(arg);
    }
  }

  if (Object.keys(tags).length > 0) {
    result.tags = tags;
  }

  return result;
}

async function handleServerCommand(args: Record<string, any>): Promise<void> {
  const port = Number(args.port || args.p || 8765);
  const udpPortRaw = args.udp || args.u;
  const udpPort = udpPortRaw === 'false' ? false : Number(udpPortRaw || 8766);
  const host = args.host || args.h || '127.0.0.1';
  const defaultTtlSec = Number(args.ttl || 30);
  const defaultGraceSec = Number(args.grace || 15);
  const audibleBell = !args.noBell;

  const notifiers: Notifier[] = [
    new ConsoleNotifier({ audibleBell })
  ];

  if (args.discord) {
    notifiers.push(new DiscordNotifier({ webhookUrl: String(args.discord) }));
  }
  if (args.slack) {
    notifiers.push(new SlackNotifier({ webhookUrl: String(args.slack) }));
  }
  if (args.telegram) {
    const parts = String(args.telegram).split(':');
    if (parts.length >= 2) {
      notifiers.push(new TelegramNotifier({ botToken: parts[0], chatId: parts.slice(1).join(':') }));
    }
  }
  if (args.webhook) {
    notifiers.push(new WebhookNotifier({ url: String(args.webhook) }));
  }

  const server = new HeartbeatServer({
    http: { port, host },
    udp: udpPort === false ? false : { port: udpPort, host },
    beacon: { defaultTtlSec, defaultGraceSec, checkIntervalMs: 1000 },
    notifiers
  });

  const { httpPort, udpPort: actualUdp } = await server.start();

  console.log(`
\x1b[1m\x1b[36m╭──────────────────────────────────────────────────────────╮\x1b[0m
\x1b[1m\x1b[36m│\x1b[0m  \x1b[1m\x1b[32mAGENT BEACON DAEMON ONLINE\x1b[0m                             \x1b[1m\x1b[36m│\x1b[0m
\x1b[1m\x1b[36m│\x1b[0m  \x1b[90mOperating under Nymrel -> JalenBuilds LLC               \x1b[1m\x1b[36m│\x1b[0m
\x1b[1m\x1b[36m├──────────────────────────────────────────────────────────┤\x1b[0m
\x1b[1m\x1b[36m│\x1b[0m  HTTP Endpoint:  \x1b[1mhttp://${host}:${httpPort}\x1b[0m
\x1b[1m\x1b[36m│\x1b[0m  UDP Socket:     \x1b[1m${actualUdp ? `udp://${host}:${actualUdp}` : 'Disabled'}\x1b[0m
\x1b[1m\x1b[36m│\x1b[0m  Default TTL:    ${defaultTtlSec}s (Grace: ${defaultGraceSec}s)
\x1b[1m\x1b[36m│\x1b[0m  Notifiers:      ${notifiers.map((n) => n.name).join(', ')}
\x1b[1m\x1b[36m╰──────────────────────────────────────────────────────────╯\x1b[0m
`);

  const shutdown = async () => {
    console.log('\nStopping Agent Beacon daemon...');
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function handlePingCommand(args: Record<string, any>): Promise<void> {
  const id = args.id || args.i;
  if (!id) {
    console.error('Error: --id <agentId> is required for ping command');
    process.exit(1);
  }

  const url = normalizeHttpBaseUrl(args.url || 'http://127.0.0.1:8765', 'Beacon URL');
  const payload = {
    id,
    name: args.name || id,
    ttlSec: args.ttl ? Number(args.ttl) : undefined,
    graceSec: args.grace ? Number(args.grace) : undefined,
    status: args.status || 'ok',
    tags: args.tags || {},
    timestamp: Date.now()
  };

  try {
    await sendHttpJson(`${url}/ping`, payload);
    console.log(`\x1b[32m✓\x1b[0m Ping registered for agent '\x1b[1m${id}\x1b[0m' at ${url}`);
  } catch (err) {
    console.error(`\x1b[31m✗\x1b[0m Failed to ping beacon at ${url}: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

async function handleDoneCommand(args: Record<string, any>): Promise<void> {
  const id = args.id || args.i;
  if (!id) {
    console.error('Error: --id <agentId> is required for done command');
    process.exit(1);
  }

  const url = normalizeHttpBaseUrl(args.url || 'http://127.0.0.1:8765', 'Beacon URL');
  const reason = args.reason || 'Agent completed work successfully';

  try {
    await sendHttpJson(`${url}/deregister`, { id, reason });
    console.log(`\x1b[32m✓\x1b[0m Agent '\x1b[1m${id}\x1b[0m' gracefully retired at ${url}`);
  } catch (err) {
    console.error(`\x1b[31m✗\x1b[0m Failed to deregister agent at ${url}: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

async function handleStatusCommand(args: Record<string, any>): Promise<void> {
  const url = normalizeHttpBaseUrl(args.url || 'http://127.0.0.1:8765', 'Beacon URL');
  const isWatch = Boolean(args.watch);
  const isJson = Boolean(args.json);

  const fetchAndRender = async () => {
    try {
      const summary = await fetchHttpJson<FleetSummary>(`${url}/status`);
      if (isJson) {
        console.log(JSON.stringify(summary, null, 2));
        return;
      }

      if (isWatch) {
        console.clear();
      }

      renderFleetTable(summary, url);
    } catch (err) {
      console.error(`Failed to reach beacon at ${url}: ${err instanceof Error ? err.message : String(err)}`);
      if (!isWatch) process.exit(1);
    }
  };

  await fetchAndRender();
  if (isWatch) {
    setInterval(fetchAndRender, 2000);
  }
}

function renderFleetTable(data: any, url: string): void {
  const s = data.summary || data;
  const timeStr = new Date(s.timestamp || Date.now()).toLocaleTimeString();

  console.log(`
\x1b[1m\x1b[36mAGENT BEACON FLEET STATUS\x1b[0m [${url}] — \x1b[90m${timeStr}\x1b[0m
\x1b[90m─────────────────────────────────────────────────────────────────────────────\x1b[0m
  \x1b[1mTotal:\x1b[0m ${s.total}   \x1b[32mHealthy:\x1b[0m ${s.healthy}   \x1b[33mDegraded:\x1b[0m ${s.degraded}   \x1b[31mDead:\x1b[0m ${s.dead}   \x1b[90mRetired:\x1b[0m ${s.deregistered}
\x1b[90m─────────────────────────────────────────────────────────────────────────────\x1b[0m`);

  if (!s.agents || s.agents.length === 0) {
    console.log('  \x1b[90mNo active agent heartbeats registered.\x1b[0m\n');
    return;
  }

  console.log(`  \x1b[1m${'AGENT ID'.padEnd(24)} ${'STATUS'.padEnd(14)} ${'LAST SEEN'.padEnd(12)} ${'TTL/GRACE'.padEnd(12)} ${'PINGS'}\x1b[0m`);

  for (const a of s.agents) {
    let statusFormatted = a.status;
    if (a.status === 'HEALTHY') statusFormatted = `\x1b[32m● HEALTHY\x1b[0m`;
    else if (a.status === 'DEGRADED') statusFormatted = `\x1b[33m▲ DEGRADED\x1b[0m`;
    else if (a.status === 'DEAD') statusFormatted = `\x1b[31m✖ DEAD\x1b[0m`;
    else if (a.status === 'DEREGISTERED') statusFormatted = `\x1b[90m○ RETIRED\x1b[0m`;

    const id = a.id.length > 22 ? a.id.slice(0, 21) + '…' : a.id;
    const lastSeen = `${a.lastPingAgeSec}s ago`;
    const ttl = `${a.ttlSec}s/${a.graceSec}s`;

    console.log(`  ${id.padEnd(24)} ${statusFormatted.padEnd(23)} ${lastSeen.padEnd(12)} ${ttl.padEnd(12)} ${a.totalPings}`);
  }
  console.log('');
}

async function handleWatchCommand(args: Record<string, any>, rawArgs: string[]): Promise<void> {
  const id = args.id || args.i || `proc-${process.pid}`;
  const name = args.name || id;
  const url = normalizeHttpBaseUrl(args.url || 'http://127.0.0.1:8765', 'Beacon URL');
  const intervalSec = Number(args.interval || 10);
  const ttlSec = Number(args.ttl || intervalSec * 3);

  // Extract wrapped command after '--'
  const dashDashIdx = rawArgs.indexOf('--');
  if (dashDashIdx === -1 || dashDashIdx === rawArgs.length - 1) {
    console.error('Error: "agent-beacon watch" requires a command after "--". Example:');
    console.error('  $ agent-beacon watch --id my-worker -- python run_worker.py');
    process.exit(1);
  }

  const cmdParts = rawArgs.slice(dashDashIdx + 1);
  const cmd = cmdParts[0];
  const cmdArgs = cmdParts.slice(1);

  console.log(`\x1b[36m[Agent Beacon]\x1b[0m Wrapping process '\x1b[1m${cmdParts.join(' ')}\x1b[0m' (Agent ID: \x1b[1m${id}\x1b[0m)`);

  const sendPing = async (status: 'ok' | 'degraded' | 'error' = 'ok') => {
    try {
      await sendHttpJson(`${url}/ping`, {
        id,
        name,
        ttlSec,
        graceSec: Math.round(ttlSec / 2),
        status,
        timestamp: Date.now(),
        tags: { pid: String(process.pid), cmd: cmd }
      });
    } catch {
      // ignore transient network errors
    }
  };

  // Initial ping
  await sendPing('ok');

  // Background interval timer
  const timer = setInterval(() => {
    sendPing('ok').catch(() => {});
  }, intervalSec * 1000);

  const child = spawn(cmd, cmdArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  child.on('error', async (err) => {
    clearInterval(timer);
    await sendPing('error');
    console.error(`\x1b[31m[Agent Beacon] Failed to spawn child process:\x1b[0m ${err.message}`);
    process.exit(1);
  });

  child.on('close', async (code) => {
    clearInterval(timer);
    if (code === 0) {
      try {
        await sendHttpJson(`${url}/deregister`, {
          id,
          reason: 'Process completed with exit code 0'
        });
      } catch {
        // ignore
      }
      process.exit(0);
    } else {
      try {
        await sendHttpJson(`${url}/ping`, {
          id,
          status: 'error',
          tags: { exitCode: String(code) }
        });
      } catch {
        // ignore
      }
      process.exit(code ?? 1);
    }
  });
}

function sendHttpJson(targetUrl: string, body: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsed = requireHttpUrl(targetUrl, 'Beacon endpoint');
    const data = JSON.stringify(body);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.request(
      parsed,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        },
        timeout: 4000
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      }
    );

    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function fetchHttpJson<T>(targetUrl: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsed = requireHttpUrl(targetUrl, 'Beacon endpoint');
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.request(
      parsed,
      { method: 'GET', timeout: 4000 },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const parsedJson = JSON.parse(body);
            resolve(parsedJson as T);
          } catch {
            reject(new Error(`Failed to parse JSON response: ${body}`));
          }
        });
      }
    );

    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
    req.end();
  });
}

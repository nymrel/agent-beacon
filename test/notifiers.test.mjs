import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import {
  ConsoleNotifier,
  DiscordNotifier,
  SlackNotifier,
  TelegramNotifier,
  WebhookNotifier,
  createNotifierFromUrl
} from '../dist/notifiers/index.js';

test('ConsoleNotifier - formats ANSI badges without error', async () => {
  let output = '';
  const outStream = new Writable({
    write(chunk, encoding, callback) {
      output += chunk.toString();
      callback();
    }
  });

  const notifier = new ConsoleNotifier({ audibleBell: false, outStream });

  const dummyRecord = {
    id: 'agent-sol',
    name: 'Sol Worker',
    status: 'DEAD',
    lastPingAt: Date.now() - 30000,
    firstSeenAt: Date.now() - 60000,
    ttlMs: 20000,
    graceMs: 10000,
    seq: 5,
    consecutiveMisses: 1,
    totalPings: 5,
    lastPayload: { id: 'agent-sol' },
    tags: { env: 'prod' },
    history: []
  };

  await notifier.notify({
    type: 'agent:dead',
    agentId: 'agent-sol',
    timestamp: Date.now(),
    agent: dummyRecord,
    reason: 'Unresponsive for 30s'
  });

  assert.ok(output.includes('DEAD'));
  assert.ok(output.includes('agent-sol'));
  assert.ok(output.includes('Sol Worker'));
  assert.ok(output.includes('env=prod'));
});

test('createNotifierFromUrl - auto-detects webhook types', () => {
  const discord = createNotifierFromUrl('https://discord.com/api/webhooks/123/abc');
  assert.equal(discord.name, 'discord');

  const slack = createNotifierFromUrl('https://hooks.slack.com/services/T00/B00/X00');
  assert.equal(slack.name, 'slack');

  const telegram = createNotifierFromUrl('telegram://bot123456:987654321');
  assert.equal(telegram.name, 'telegram');

  const consoleN = createNotifierFromUrl('console');
  assert.equal(consoleN.name, 'console');

  const generic = createNotifierFromUrl('https://api.mycorp.internal/beacons');
  assert.equal(generic.name, 'webhook');
});

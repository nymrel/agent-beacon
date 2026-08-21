import test from 'node:test';
import assert from 'node:assert/strict';
import { HeartbeatServer } from '../dist/server/heartbeat-server.js';
import { createPingClient } from '../dist/client/ping-client.js';

test('AgentBeaconClient - ping and done lifecycle', async () => {
  const server = new HeartbeatServer({
    http: { port: 0, host: '127.0.0.1' },
    udp: false
  });
  const { httpPort } = await server.start();
  const beaconUrl = `http://127.0.0.1:${httpPort}`;

  try {
    const client = createPingClient({
      beaconUrl,
      agentId: 'client-test-1',
      name: 'Client Test Worker',
      intervalMs: 100,
      tags: { test: 'true' }
    });

    // 1. One-shot ping
    const pingOk = await client.ping({ metrics: { stepIndex: 1 } });
    assert.equal(pingOk, true);

    const store = server.getStore();
    const record = store.get('client-test-1');
    assert.ok(record);
    assert.equal(record.name, 'Client Test Worker');
    assert.equal(record.status, 'HEALTHY');
    assert.equal(record.tags.test, 'true');

    // 2. Start background heartbeat
    client.start();
    await new Promise((r) => setTimeout(r, 250));
    assert.ok(record.totalPings >= 2);

    // 3. Graceful retirement
    const doneOk = await client.done('Job completed');
    assert.equal(doneOk, true);
    assert.equal(record.status, 'DEREGISTERED');
  } finally {
    await server.stop();
  }
});

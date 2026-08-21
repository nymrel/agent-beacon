import test from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { HeartbeatStore } from '../dist/core/store.js';
import { Watchdog } from '../dist/core/watchdog.js';
import { BeaconUdpServer } from '../dist/protocols/udp.js';

test('BeaconUdpServer - accepts UDP heartbeats', async () => {
  const store = new HeartbeatStore();
  const watchdog = new Watchdog(store);
  const server = new BeaconUdpServer(watchdog, { port: 0, host: '127.0.0.1' });

  const port = await server.start();
  const client = dgram.createSocket('udp4');

  try {
    // 1. Send JSON UDP ping
    const jsonMsg = Buffer.from(JSON.stringify({
      id: 'agent-udp-json',
      name: 'UDP Json Worker',
      seq: 1
    }));
    await new Promise((resolve, reject) => {
      client.send(jsonMsg, port, '127.0.0.1', (err) => (err ? reject(err) : resolve()));
    });

    // 2. Send plain text UDP ping
    const textMsg = Buffer.from('agent-udp-raw');
    await new Promise((resolve, reject) => {
      client.send(textMsg, port, '127.0.0.1', (err) => (err ? reject(err) : resolve()));
    });

    // Wait a brief moment for socket processing
    await new Promise((r) => setTimeout(r, 80));

    const rec1 = store.get('agent-udp-json');
    assert.ok(rec1);
    assert.equal(rec1.name, 'UDP Json Worker');

    const rec2 = store.get('agent-udp-raw');
    assert.ok(rec2);
    assert.equal(rec2.id, 'agent-udp-raw');
  } finally {
    client.close();
    await server.stop();
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { HeartbeatStore } from '../dist/core/store.js';
import { Watchdog } from '../dist/core/watchdog.js';
import { SseManager } from '../dist/protocols/sse.js';
import { BeaconHttpServer } from '../dist/protocols/http.js';
import { BeaconUdpServer } from '../dist/protocols/udp.js';

test('HTTP and UDP listeners bind to loopback by default', async () => {
  const store = new HeartbeatStore();
  const watchdog = new Watchdog(store);
  const httpServer = new BeaconHttpServer(store, watchdog, new SseManager(), { port: 0 });
  const udpServer = new BeaconUdpServer(watchdog, { port: 0 });

  try {
    await httpServer.start();
    await udpServer.start();
    assert.equal(httpServer.getAddress(), '127.0.0.1');
    assert.equal(udpServer.getAddress(), '127.0.0.1');
  } finally {
    await httpServer.stop();
    await udpServer.stop();
  }
});

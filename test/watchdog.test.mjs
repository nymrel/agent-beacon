import test from 'node:test';
import assert from 'node:assert/strict';
import { HeartbeatStore } from '../dist/core/store.js';
import { Watchdog } from '../dist/core/watchdog.js';

test('Watchdog - transitions to DEGRADED and DEAD upon missing heartbeats', () => {
  const store = new HeartbeatStore();
  const watchdog = new Watchdog(store, { checkIntervalMs: 50 });

  const events = [];
  watchdog.on('event', (e) => events.push(e));

  // Register with 100ms TTL and 100ms Grace
  const record = watchdog.recordPing({
    id: 'test-agent-1',
    name: 'Watcher Test',
    ttlSec: 0.1, // 100ms
    graceSec: 0.1 // 100ms
  });

  assert.equal(record.status, 'HEALTHY');
  assert.equal(events[0].type, 'ping');
  assert.equal(events[1].type, 'agent:registered');

  // Manually simulate time passing for deterministic testing
  const now = Date.now();
  record.lastPingAt = now - 150; // past 100ms TTL, within 200ms dead deadline

  watchdog.checkLiveness();
  assert.equal(record.status, 'DEGRADED');
  const degradedEv = events.find((e) => e.type === 'agent:degraded');
  assert.ok(degradedEv);
  assert.equal(degradedEv.agentId, 'test-agent-1');

  // Advance past dead deadline (TTL + Grace = 200ms)
  record.lastPingAt = now - 250;
  watchdog.checkLiveness();
  assert.equal(record.status, 'DEAD');
  const deadEv = events.find((e) => e.type === 'agent:dead');
  assert.ok(deadEv);
  assert.equal(deadEv.agentId, 'test-agent-1');

  // Revive agent
  watchdog.recordPing({ id: 'test-agent-1' });
  assert.equal(record.status, 'HEALTHY');
  const recoveredEv = events.find((e) => e.type === 'agent:recovered');
  assert.ok(recoveredEv);
  assert.equal(recoveredEv.agentId, 'test-agent-1');
});

test('Watchdog - graceful deregistration event', () => {
  const store = new HeartbeatStore();
  const watchdog = new Watchdog(store);

  let deregFired = false;
  watchdog.on('agent:deregistered', (e) => {
    assert.equal(e.agentId, 'worker-retire');
    assert.equal(e.reason, 'Task finished');
    deregFired = true;
  });

  watchdog.recordPing({ id: 'worker-retire' });
  const retired = watchdog.deregister('worker-retire', 'Task finished');

  assert.ok(retired);
  assert.equal(retired.status, 'DEREGISTERED');
  assert.equal(deregFired, true);
});

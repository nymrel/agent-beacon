import test from 'node:test';
import assert from 'node:assert/strict';
import { HeartbeatStore } from '../dist/core/store.js';

test('HeartbeatStore - registration and updates', () => {
  const store = new HeartbeatStore({ defaultTtlSec: 10, defaultGraceSec: 5 });

  // 1. Initial registration
  const res1 = store.registerOrUpdate({
    id: 'agent-alpha',
    name: 'Worker Alpha',
    tags: { env: 'test', model: 'sol' }
  });

  assert.equal(res1.isNew, true);
  assert.equal(res1.record.id, 'agent-alpha');
  assert.equal(res1.record.name, 'Worker Alpha');
  assert.equal(res1.record.status, 'HEALTHY');
  assert.equal(res1.record.ttlMs, 10000);
  assert.equal(res1.record.graceMs, 5000);
  assert.equal(res1.record.totalPings, 1);
  assert.equal(res1.record.tags.env, 'test');
  assert.equal(res1.record.tags.model, 'sol');

  // 2. Subsequent ping updates
  const res2 = store.registerOrUpdate({
    id: 'agent-alpha',
    seq: 2,
    tags: { step: '3' }
  });

  assert.equal(res2.isNew, false);
  assert.equal(res2.record.totalPings, 2);
  assert.equal(res2.record.seq, 2);
  assert.equal(res2.record.tags.step, '3');
  assert.equal(res2.record.tags.env, 'test'); // merged tags

  // 3. Retrieve agent
  const retrieved = store.get('agent-alpha');
  assert.ok(retrieved);
  assert.equal(retrieved.id, 'agent-alpha');

  // 4. Summary calculation
  const summary = store.getFleetSummary();
  assert.equal(summary.total, 1);
  assert.equal(summary.healthy, 1);
  assert.equal(summary.dead, 0);
  assert.equal(summary.agents[0].id, 'agent-alpha');
});

test('HeartbeatStore - deregistration', () => {
  const store = new HeartbeatStore();
  store.registerOrUpdate({ id: 'worker-1' });

  const record = store.deregister('worker-1', 'Clean shutdown');
  assert.ok(record);
  assert.equal(record.status, 'DEREGISTERED');

  const summary = store.getFleetSummary();
  assert.equal(summary.total, 1);
  assert.equal(summary.healthy, 0);
  assert.equal(summary.deregistered, 1);
});

test('HeartbeatStore - missing ID throws error', () => {
  const store = new HeartbeatStore();
  assert.throws(() => {
    store.registerOrUpdate({ id: '   ' });
  }, /missing required non-empty "id"/);
});

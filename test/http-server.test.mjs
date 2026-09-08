import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { HeartbeatStore } from '../dist/core/store.js';
import { Watchdog } from '../dist/core/watchdog.js';
import { SseManager } from '../dist/protocols/sse.js';
import { BeaconHttpServer } from '../dist/protocols/http.js';

test('BeaconHttpServer - full lifecycle and endpoints', async () => {
  const store = new HeartbeatStore();
  const watchdog = new Watchdog(store);
  const sseManager = new SseManager();
  const server = new BeaconHttpServer(store, watchdog, sseManager, { port: 0, host: '127.0.0.1' });

  const port = await server.start();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. GET /llms.txt
    const llmsRes = await fetchJson(`${baseUrl}/llms.txt`, { isText: true });
    assert.equal(llmsRes.status, 200);
    assert.ok(llmsRes.body.includes('Agent Beacon Liveness Sentinel'));
    assert.ok(llmsRes.body.includes('Nymrel -> JalenBuilds LLC'));

    // 2. POST /ping
    const pingRes = await fetchJson(`${baseUrl}/ping`, {
      method: 'POST',
      body: JSON.stringify({
        id: 'worker-http-1',
        name: 'HTTP Worker',
        ttlSec: 20,
        tags: { role: 'evaluator' }
      })
    });
    assert.equal(pingRes.status, 200);
    assert.equal(pingRes.body.ok, true);
    assert.equal(pingRes.body.agent.id, 'worker-http-1');

    // 3. GET /ping (query param)
    const getPingRes = await fetchJson(`${baseUrl}/ping?id=worker-http-2&name=WorkerTwo&ttl=15`);
    assert.equal(getPingRes.status, 200);
    assert.equal(getPingRes.body.agent.id, 'worker-http-2');

    // 4. GET /status
    const statusRes = await fetchJson(`${baseUrl}/status`);
    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.body.mesh, 'agent-beacon');
    assert.equal(statusRes.body.summary.total, 2);
    assert.equal(statusRes.body.summary.healthy, 2);

    // 5. GET /agents/:id
    const agentRes = await fetchJson(`${baseUrl}/agents/worker-http-1`);
    assert.equal(agentRes.status, 200);
    assert.equal(agentRes.body.agent.id, 'worker-http-1');
    assert.equal(agentRes.body.agent.name, 'HTTP Worker');

    // 6. DELETE /agents/:id
    const delRes = await fetchJson(`${baseUrl}/agents/worker-http-2`, { method: 'DELETE' });
    assert.equal(delRes.status, 200);
    assert.equal(delRes.body.status, 'DEREGISTERED');

    // 7. GET /status again to verify summary updated
    const statusRes2 = await fetchJson(`${baseUrl}/status`);
    assert.equal(statusRes2.body.summary.healthy, 1);
    assert.equal(statusRes2.body.summary.deregistered, 1);
  } finally {
    await server.stop();
  }
});

test('BeaconHttpServer - POST /ping honors interval and grace aliases', async () => {
  const store = new HeartbeatStore();
  const watchdog = new Watchdog(store);
  const sseManager = new SseManager();
  const server = new BeaconHttpServer(store, watchdog, sseManager, { port: 0, host: '127.0.0.1' });

  const port = await server.start();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const bareAliases = await fetchJson(`${baseUrl}/ping`, {
      method: 'POST',
      body: JSON.stringify({ id: 'bare-aliases', interval: 5, grace: 2 })
    });
    assert.equal(bareAliases.status, 200);
    assert.equal(bareAliases.body.agent.ttlMs, 5000);
    assert.equal(bareAliases.body.agent.graceMs, 2000);

    const snakeAliases = await fetchJson(`${baseUrl}/api/v1/ping`, {
      method: 'POST',
      body: JSON.stringify({ id: 'snake-aliases', interval_sec: 7, grace_sec: 3 })
    });
    assert.equal(snakeAliases.status, 200);
    assert.equal(snakeAliases.body.agent.ttlMs, 7000);
    assert.equal(snakeAliases.body.agent.graceMs, 3000);

    const canonicalNames = await fetchJson(`${baseUrl}/ping`, {
      method: 'POST',
      body: JSON.stringify({
        id: 'canonical-names',
        ttlSec: 11,
        ttl_sec: 9,
        interval: 5,
        graceSec: 4,
        grace_sec: 3,
        grace: 2
      })
    });
    assert.equal(canonicalNames.status, 200);
    assert.equal(canonicalNames.body.agent.ttlMs, 11000);
    assert.equal(canonicalNames.body.agent.graceMs, 4000);
  } finally {
    await server.stop();
  }
});

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isPost = options.method === 'POST';
    const isDelete = options.method === 'DELETE';
    const method = options.method || 'GET';

    const headers = { ...(options.headers || {}) };
    if (options.body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(options.body);
    }

    const req = http.request(parsed, { method, headers }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try {
          const body = options.isText ? raw : JSON.parse(raw);
          resolve({ status: res.statusCode, body });
        } catch {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });

    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

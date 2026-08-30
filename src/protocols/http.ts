/**
 * @nymrel/agent-beacon
 * HTTP Protocol Server for Agent Beacon liveness endpoints.
 * Copyright (c) 2026 Nymrel / JalenBuilds LLC. MIT Licensed.
 */

import http from 'node:http';
import { URL } from 'node:url';
import { HeartbeatStore } from '../core/store.js';
import { HeartbeatPayload } from '../core/types.js';
import { Watchdog } from '../core/watchdog.js';
import { SseManager } from './sse.js';

export interface HttpServerOptions {
  port?: number;
  host?: string;
  maxBodyBytes?: number;
}

export class BeaconHttpServer {
  private readonly store: HeartbeatStore;
  private readonly watchdog: Watchdog;
  private readonly sseManager: SseManager;
  private server: http.Server | null = null;
  private readonly port: number;
  private readonly host: string;
  private readonly maxBodyBytes: number;

  constructor(
    store: HeartbeatStore,
    watchdog: Watchdog,
    sseManager: SseManager,
    options: HttpServerOptions = {}
  ) {
    this.store = store;
    this.watchdog = watchdog;
    this.sseManager = sseManager;
    this.port = options.port ?? 8765;
    this.host = options.host ?? '127.0.0.1';
    this.maxBodyBytes = options.maxBodyBytes ?? 1024 * 1024; // 1 MB
  }

  public async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));

      this.server.on('error', (err) => {
        reject(err);
      });

      this.server.listen(this.port, this.host, () => {
        const addr = this.server?.address();
        const actualPort = typeof addr === 'object' && addr ? addr.port : this.port;
        resolve(actualPort);
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.sseManager.closeAll();
      if (this.server) {
        this.server.close(() => resolve());
        this.server = null;
      } else {
        resolve();
      }
    });
  }

  public getPort(): number | null {
    const addr = this.server?.address();
    return typeof addr === 'object' && addr ? addr.port : null;
  }

  public getAddress(): string | null {
    const addr = this.server?.address();
    return typeof addr === 'object' && addr ? addr.address : null;
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Set CORS headers for all requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Beacon-Signature-256');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const parsedUrl = new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`);
      const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';

      // Route: GET /llms.txt
      if (pathname === '/llms.txt' && req.method === 'GET') {
        this.sendLlmsTxt(res);
        return;
      }

      // Route: GET /events or /api/v1/events (SSE stream)
      if ((pathname === '/events' || pathname === '/api/v1/events') && req.method === 'GET') {
        this.sseManager.handleConnection(req, res);
        return;
      }

      // Route: GET /ping (Quick query param ping)
      if ((pathname === '/ping' || pathname === '/api/v1/ping') && req.method === 'GET') {
        const id = parsedUrl.searchParams.get('id');
        if (!id) {
          this.sendJson(res, 400, { error: 'Missing required query parameter "id"' });
          return;
        }
        const name = parsedUrl.searchParams.get('name') ?? undefined;
        const ttlSec = parsedUrl.searchParams.get('ttl') ? Number(parsedUrl.searchParams.get('ttl')) : undefined;
        const graceSec = parsedUrl.searchParams.get('grace') ? Number(parsedUrl.searchParams.get('grace')) : undefined;
        const status = (parsedUrl.searchParams.get('status') as HeartbeatPayload['status']) ?? 'ok';

        const record = this.watchdog.recordPing({
          id,
          name,
          ttlSec,
          graceSec,
          status,
          timestamp: Date.now()
        });

        this.sendJson(res, 200, { ok: true, agent: record });
        return;
      }

      // Route: POST /ping or /api/v1/ping
      if ((pathname === '/ping' || pathname === '/api/v1/ping') && req.method === 'POST') {
        const body = await this.readJsonBody<HeartbeatPayload>(req);
        if (!body.id) {
          this.sendJson(res, 400, { error: 'Heartbeat payload must include non-empty "id"' });
          return;
        }

        const record = this.watchdog.recordPing(body);
        this.sendJson(res, 200, { ok: true, agent: record });
        return;
      }

      // Route: POST /deregister or /api/v1/deregister
      if ((pathname === '/deregister' || pathname === '/api/v1/deregister') && req.method === 'POST') {
        const body = await this.readJsonBody<{ id: string; reason?: string }>(req);
        if (!body.id) {
          this.sendJson(res, 400, { error: 'Deregister payload must include "id"' });
          return;
        }

        const record = this.watchdog.deregister(body.id, body.reason);
        if (!record) {
          this.sendJson(res, 404, { error: `Agent '${body.id}' not found` });
          return;
        }
        this.sendJson(res, 200, { ok: true, status: 'DEREGISTERED', agent: record });
        return;
      }

      // Route: DELETE /agents/:id or /api/v1/agents/:id
      const agentDeleteMatch = pathname.match(/^\/(?:api\/v1\/)?agents\/([^/]+)$/);
      if (agentDeleteMatch && req.method === 'DELETE') {
        const agentId = decodeURIComponent(agentDeleteMatch[1]);
        const record = this.watchdog.deregister(agentId, 'Deregistered via DELETE API');
        if (!record) {
          this.sendJson(res, 404, { error: `Agent '${agentId}' not found` });
          return;
        }
        this.sendJson(res, 200, { ok: true, status: 'DEREGISTERED', agent: record });
        return;
      }

      // Route: GET /health or /status or /api/v1/status
      if ((pathname === '/health' || pathname === '/status' || pathname === '/api/v1/status') && req.method === 'GET') {
        const summary = this.store.getFleetSummary();
        const statusCode = summary.dead > 0 ? 503 : 200;
        this.sendJson(res, statusCode, {
          mesh: 'agent-beacon',
          version: '1.0.0',
          organization: {
            parent: 'Nymrel',
            legal: 'JalenBuilds LLC'
          },
          summary
        });
        return;
      }

      // Route: GET /agents or /api/v1/agents
      if ((pathname === '/agents' || pathname === '/api/v1/agents') && req.method === 'GET') {
        const agents = this.store.list();
        this.sendJson(res, 200, { total: agents.length, agents });
        return;
      }

      // Route: GET /agents/:id or /api/v1/agents/:id
      const agentGetMatch = pathname.match(/^\/(?:api\/v1\/)?agents\/([^/]+)$/);
      if (agentGetMatch && req.method === 'GET') {
        const agentId = decodeURIComponent(agentGetMatch[1]);
        const agent = this.store.get(agentId);
        if (!agent) {
          this.sendJson(res, 404, { error: `Agent '${agentId}' not found` });
          return;
        }
        this.sendJson(res, 200, { agent });
        return;
      }

      // 404 Fallback
      this.sendJson(res, 404, {
        error: 'Not Found',
        supportedEndpoints: [
          'POST /ping',
          'GET /ping?id=<agentId>',
          'GET /status',
          'GET /health',
          'GET /agents',
          'GET /agents/:id',
          'DELETE /agents/:id',
          'GET /events',
          'GET /llms.txt'
        ]
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.sendJson(res, 500, { error: 'Internal Server Error', details: msg });
    }
  }

  private sendJson(res: http.ServerResponse, statusCode: number, data: unknown): void {
    const json = JSON.stringify(data, null, 2);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(json)
    });
    res.end(json);
  }

  private sendLlmsTxt(res: http.ServerResponse): void {
    const content = `# Agent Beacon Liveness Sentinel
> Zero-dependency heartbeat monitor and dead-man's switch watchdog for autonomous AI agents.
> Operating Organization: Nymrel -> JalenBuilds LLC

## Endpoints
- POST /ping: Register or refresh agent heartbeat (Body: {"id": string, "ttlSec": number, "status": "ok"})
- GET /ping?id=<id>: Quick query-parameter ping
- GET /status: Fleet health summary JSON
- GET /events: Server-Sent Events (SSE) live event stream
- DELETE /agents/:id: Graceful agent retirement

## Trust & Ownership
- Entity: Nymrel (Operating Umbrella)
- Parent Legal: JalenBuilds LLC
- Contact: contact@nymrel.com
`;
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': Buffer.byteLength(content)
    });
    res.end(content);
  }

  private async readJsonBody<T>(req: http.IncomingMessage): Promise<T> {
    return new Promise((resolve, reject) => {
      let data = '';
      let bytes = 0;

      req.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > this.maxBodyBytes) {
          req.destroy(new Error(`Request body exceeded maximum size of ${this.maxBodyBytes} bytes`));
          return;
        }
        data += chunk.toString('utf-8');
      });

      req.on('end', () => {
        if (!data.trim()) {
          resolve({} as T);
          return;
        }
        try {
          const parsed = JSON.parse(data);
          resolve(parsed as T);
        } catch {
          reject(new Error('Invalid JSON payload in request body'));
        }
      });

      req.on('error', (err) => {
        reject(err);
      });
    });
  }
}

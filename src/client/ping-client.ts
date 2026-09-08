/**
 * @nymrel/agent-beacon
 * PingClient: Ultra-lightweight heartbeat client for autonomous AI agents and workers.
 * Copyright (c) 2026 Nymrel / JalenBuilds LLC. MIT Licensed.
 */

import http from 'node:http';
import https from 'node:https';
import process from 'node:process';
import { HeartbeatPayload, PingClientOptions } from '../core/types.js';
import { normalizeHttpBaseUrl, requireHttpUrl } from '../utils/http-url.js';

export class AgentBeaconClient {
  private readonly beaconUrl: string;
  private readonly agentId: string;
  private readonly name: string;
  private readonly intervalMs: number;
  private readonly ttlSec: number;
  private readonly graceSec: number;
  private readonly autoMetrics: boolean;
  private readonly tags: Record<string, string>;
  private readonly metadata: Record<string, unknown>;

  private timer: NodeJS.Timeout | null = null;
  private seq = 0;
  private isRunning = false;

  constructor(options: PingClientOptions) {
    this.beaconUrl = normalizeHttpBaseUrl(options.beaconUrl, 'Beacon URL');
    this.agentId = options.agentId;
    this.name = options.name ?? options.agentId;
    this.intervalMs = options.intervalMs ?? 15000;
    this.ttlSec = options.ttlSec ?? 30;
    this.graceSec = options.graceSec ?? 15;
    this.autoMetrics = options.autoMetrics ?? true;
    this.tags = { ...(options.tags ?? {}) };
    this.metadata = { ...(options.metadata ?? {}) };
  }

  /**
   * Start automatic periodic background heartbeats.
   */
  public start(): this {
    if (this.isRunning) return this;
    this.isRunning = true;

    // Send immediate initial ping
    this.ping().catch(() => {
      // initial ping error ignored in background
    });

    this.timer = setInterval(() => {
      this.ping().catch(() => {
        // subsequent ping errors ignored in background
      });
    }, this.intervalMs);

    if (this.timer.unref) {
      this.timer.unref();
    }

    return this;
  }

  /**
   * Stop periodic background heartbeats.
   */
  public stop(): this {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    return this;
  }

  /**
   * Send a one-shot heartbeat ping to the beacon server.
   */
  public async ping(custom: Partial<HeartbeatPayload> = {}): Promise<boolean> {
    this.seq += 1;

    let metrics: HeartbeatPayload['metrics'] = undefined;
    if (this.autoMetrics) {
      const mem = process.memoryUsage();
      metrics = {
        memoryMb: Math.round(mem.rss / (1024 * 1024)),
        heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
        pid: process.pid,
        uptimeSec: Math.round(process.uptime()),
        ...custom.metrics
      };
    } else if (custom.metrics) {
      metrics = custom.metrics;
    }

    const payload: HeartbeatPayload = {
      id: this.agentId,
      name: this.name,
      ttlSec: this.ttlSec,
      graceSec: this.graceSec,
      seq: this.seq,
      timestamp: Date.now(),
      status: custom.status ?? 'ok',
      metrics,
      tags: { ...this.tags, ...(custom.tags ?? {}) },
      metadata: { ...this.metadata, ...(custom.metadata ?? {}) },
      ...custom
    };

    const targetUrl = `${this.beaconUrl}/ping`;
    await this.postJson(targetUrl, payload);
    return true;
  }

  /**
   * Signal graceful task completion and deregister the agent from the beacon watchdog.
   */
  public async done(reason = 'Task finished successfully'): Promise<boolean> {
    this.stop();
    const targetUrl = `${this.beaconUrl}/deregister`;
    try {
      await this.postJson(targetUrl, { id: this.agentId, reason });
      return true;
    } catch {
      return false;
    }
  }

  private async postJson(targetUrl: string, body: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const parsed = requireHttpUrl(targetUrl, 'Beacon endpoint');
        const data = JSON.stringify(body);
        const isHttps = parsed.protocol === 'https:';
        const client = isHttps ? https : http;

        const req = client.request(
          parsed,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(data),
              'User-Agent': 'AgentBeaconClient/1.0.0'
            },
            timeout: 5000
          },
          (res) => {
            let resBody = '';
            res.on('data', (chunk) => (resBody += chunk));
            res.on('end', () => {
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                resolve();
              } else {
                reject(new Error(`HTTP ${res.statusCode}: ${resBody}`));
              }
            });
          }
        );

        req.on('timeout', () => {
          req.destroy(new Error(`Ping request to ${targetUrl} timed out`));
        });

        req.on('error', (err) => {
          reject(err);
        });

        req.write(data);
        req.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}

/**
 * Factory helper to create and optionally start a ping client.
 */
export function createPingClient(options: PingClientOptions, autoStart = false): AgentBeaconClient {
  const client = new AgentBeaconClient(options);
  if (autoStart) {
    client.start();
  }
  return client;
}

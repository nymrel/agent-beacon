/**
 * @nymrel/agent-beacon
 * Base notifier abstraction and HTTP helper utilities.
 * Copyright (c) 2026 Nymrel / JalenBuilds LLC. MIT Licensed.
 */

import http from 'node:http';
import https from 'node:https';
import { BeaconEvent, Notifier } from '../core/types.js';
import { requireHttpUrl } from '../utils/http-url.js';

export abstract class BaseNotifier implements Notifier {
  public abstract readonly name: string;
  protected readonly enabledEvents: Set<string>;

  constructor(enabledEvents?: string[]) {
    this.enabledEvents = new Set(
      enabledEvents ?? ['agent:dead', 'agent:recovered', 'agent:degraded', 'agent:registered', 'agent:deregistered']
    );
  }

  public shouldNotify(event: BeaconEvent): boolean {
    return this.enabledEvents.has(event.type);
  }

  public abstract notify(event: BeaconEvent): Promise<void>;

  /**
   * Zero-dependency robust HTTP POST request.
   */
  protected async postJson(targetUrl: string, body: unknown, headers: Record<string, string> = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const parsed = requireHttpUrl(targetUrl, 'Notifier URL');
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
              'User-Agent': 'AgentBeacon/1.0.0 (Nymrel)',
              ...headers
            },
            timeout: 8000
          },
          (res) => {
            let resBody = '';
            res.on('data', (chunk) => (resBody += chunk));
            res.on('end', () => {
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                resolve();
              } else {
                reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage}: ${resBody.slice(0, 200)}`));
              }
            });
          }
        );

        req.on('timeout', () => {
          req.destroy(new Error(`Request to ${targetUrl} timed out after 8000ms`));
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

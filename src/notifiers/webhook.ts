/**
 * @nymrel/agent-beacon
 * WebhookNotifier: Generic HTTP/HTTPS POST webhook with optional HMAC-SHA256 signature.
 * Copyright (c) 2026 Nymrel / JalenBuilds LLC. MIT Licensed.
 */

import crypto from 'node:crypto';
import { BeaconEvent } from '../core/types.js';
import { BaseNotifier } from './base.js';

export interface WebhookNotifierOptions {
  url: string;
  secret?: string;
  headers?: Record<string, string>;
  enabledEvents?: string[];
}

export class WebhookNotifier extends BaseNotifier {
  public readonly name = 'webhook';
  private readonly targetUrl: string;
  private readonly secret?: string;
  private readonly customHeaders: Record<string, string>;

  constructor(options: WebhookNotifierOptions) {
    super(options.enabledEvents);
    this.targetUrl = options.url;
    this.secret = options.secret;
    this.customHeaders = options.headers ?? {};
  }

  public async notify(event: BeaconEvent): Promise<void> {
    if (!this.shouldNotify(event)) return;

    const payload = {
      event: event.type,
      timestamp: event.timestamp,
      agentId: event.agentId,
      status: event.agent.status,
      agent: event.agent,
      previousStatus: event.previousStatus,
      reason: event.reason,
      metadata: event.metadata
    };

    const headers: Record<string, string> = {
      ...this.customHeaders
    };

    if (this.secret) {
      const data = JSON.stringify(payload);
      const signature = crypto.createHmac('sha256', this.secret).update(data).digest('hex');
      headers['X-Beacon-Signature-256'] = `sha256=${signature}`;
    }

    await this.postJson(this.targetUrl, payload, headers);
  }
}

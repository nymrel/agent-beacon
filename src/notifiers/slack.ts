/**
 * @nymrel/agent-beacon
 * SlackNotifier: Dispatches rich block-kit formatted messages to Slack incoming webhooks.
 * Copyright (c) 2026 Nymrel / JalenBuilds LLC. MIT Licensed.
 */

import { BeaconEvent } from '../core/types.js';
import { BaseNotifier } from './base.js';

export interface SlackNotifierOptions {
  webhookUrl: string;
  channel?: string;
  username?: string;
  iconEmoji?: string;
  enabledEvents?: string[];
}

export class SlackNotifier extends BaseNotifier {
  public readonly name = 'slack';
  private readonly webhookUrl: string;
  private readonly channel?: string;
  private readonly username: string;
  private readonly iconEmoji: string;

  constructor(options: SlackNotifierOptions) {
    super(options.enabledEvents);
    this.webhookUrl = options.webhookUrl;
    this.channel = options.channel;
    this.username = options.username ?? 'Agent Beacon';
    this.iconEmoji = options.iconEmoji ?? ':satellite:';
  }

  public async notify(event: BeaconEvent): Promise<void> {
    if (!this.shouldNotify(event)) return;

    let headerText = `[Agent Beacon] Event: ${event.type}`;
    let color = '#95a5a6';

    switch (event.type) {
      case 'agent:dead':
        headerText = `🚨 CRITICAL: Dead-Man's Switch Triggered`;
        color = '#danger';
        break;
      case 'agent:recovered':
        headerText = `✅ RECOVERY: Agent Resumed Heartbeats`;
        color = '#good';
        break;
      case 'agent:degraded':
        headerText = `⚠️ WARNING: Agent Heartbeat Degraded`;
        color = '#warning';
        break;
      case 'agent:registered':
        headerText = `📡 NEW AGENT: Heartbeat Sentinel Registered`;
        color = '#3498db';
        break;
      case 'agent:deregistered':
        headerText = `🏁 RETIRED: Agent Completed Work Gracefully`;
        color = '#7f8c8d';
        break;
    }

    const agent = event.agent;
    const fields = [
      { title: 'Agent ID', value: `\`${agent.id}\``, short: true },
      { title: 'Name', value: agent.name, short: true },
      { title: 'Status', value: `*${agent.status}*`, short: true },
      { title: 'Total Pings', value: `${agent.totalPings}`, short: true }
    ];

    if (event.reason) {
      fields.unshift({ title: 'Details', value: event.reason, short: false });
    }

    const payload = {
      username: this.username,
      icon_emoji: this.iconEmoji,
      channel: this.channel,
      text: `${headerText} — ${agent.name} (${agent.id})`,
      attachments: [
        {
          color,
          title: headerText,
          fields,
          footer: 'Agent Beacon • Nymrel',
          ts: Math.floor(event.timestamp / 1000)
        }
      ]
    };

    await this.postJson(this.webhookUrl, payload);
  }
}

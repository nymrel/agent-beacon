/**
 * @nymrel/agent-beacon
 * DiscordNotifier: Dispatches rich embed alert cards to Discord incoming webhooks.
 * Copyright (c) 2026 Nymrel / JalenBuilds LLC. MIT Licensed.
 */

import { BeaconEvent } from '../core/types.js';
import { BaseNotifier } from './base.js';

export interface DiscordNotifierOptions {
  webhookUrl: string;
  username?: string;
  avatarUrl?: string;
  enabledEvents?: string[];
}

export class DiscordNotifier extends BaseNotifier {
  public readonly name = 'discord';
  private readonly webhookUrl: string;
  private readonly username: string;
  private readonly avatarUrl?: string;

  constructor(options: DiscordNotifierOptions) {
    super(options.enabledEvents);
    this.webhookUrl = options.webhookUrl;
    this.username = options.username ?? 'Agent Beacon Sentinel';
    this.avatarUrl = options.avatarUrl;
  }

  public async notify(event: BeaconEvent): Promise<void> {
    if (!this.shouldNotify(event)) return;

    let color = 0x95A5A6; // Gray default
    let title = `[Agent Beacon] Event: ${event.type}`;
    let emoji = 'ℹ️';

    switch (event.type) {
      case 'agent:dead':
        color = 0xE74C3C; // Red
        title = `🚨 CRITICAL: Agent Dead-Man's Switch Triggered`;
        emoji = '🔴';
        break;
      case 'agent:recovered':
        color = 0x2ECC71; // Green
        title = `✅ RECOVERY: Agent Resumed Heartbeats`;
        emoji = '🟢';
        break;
      case 'agent:degraded':
        color = 0xF1C40F; // Yellow
        title = `⚠️ WARNING: Agent Heartbeat Missed (Degraded)`;
        emoji = '🟡';
        break;
      case 'agent:registered':
        color = 0x3498DB; // Blue
        title = `📡 NEW AGENT: Heartbeat Sentinel Registered`;
        emoji = '🔵';
        break;
      case 'agent:deregistered':
        color = 0x7F8C8D; // Dark Gray
        title = `🏁 RETIRED: Agent Completed Work Gracefully`;
        emoji = '⚪';
        break;
    }

    const agent = event.agent;
    const tagEntries = Object.entries(agent.tags);
    const tagString = tagEntries.length > 0
      ? tagEntries.map(([k, v]) => `\`${k}=${v}\``).join(' ')
      : '_None_';

    const fields: Array<{ name: string; value: string; inline?: boolean }> = [
      { name: 'Agent ID', value: `\`${agent.id}\``, inline: true },
      { name: 'Display Name', value: agent.name, inline: true },
      { name: 'Status', value: `${emoji} **${agent.status}**`, inline: true },
      { name: 'TTL / Grace', value: `${agent.ttlMs / 1000}s / ${agent.graceMs / 1000}s`, inline: true },
      { name: 'Total Pings', value: `${agent.totalPings}`, inline: true },
      { name: 'Tags', value: tagString, inline: false }
    ];

    if (event.reason) {
      fields.unshift({ name: 'Details', value: event.reason, inline: false });
    }

    const payload = {
      username: this.username,
      avatar_url: this.avatarUrl,
      embeds: [
        {
          title,
          color,
          fields,
          timestamp: new Date(event.timestamp).toISOString(),
          footer: {
            text: 'Agent Beacon • Nymrel Autonomous Mesh',
            icon_url: 'https://raw.githubusercontent.com/nymrel/agent-beacon/main/assets/beacon-icon.png'
          }
        }
      ]
    };

    await this.postJson(this.webhookUrl, payload);
  }
}

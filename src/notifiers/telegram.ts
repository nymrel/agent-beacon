/**
 * @nymrel/agent-beacon
 * TelegramNotifier: Dispatches Markdown-formatted messages via Telegram Bot API.
 * Copyright (c) 2026 Nymrel / JalenBuilds LLC. MIT Licensed.
 */

import { BeaconEvent } from '../core/types.js';
import { BaseNotifier } from './base.js';

export interface TelegramNotifierOptions {
  botToken: string;
  chatId: string | number;
  enabledEvents?: string[];
}

export class TelegramNotifier extends BaseNotifier {
  public readonly name = 'telegram';
  private readonly botToken: string;
  private readonly chatId: string | number;

  constructor(options: TelegramNotifierOptions) {
    super(options.enabledEvents);
    this.botToken = options.botToken;
    this.chatId = options.chatId;
  }

  public async notify(event: BeaconEvent): Promise<void> {
    if (!this.shouldNotify(event)) return;

    let icon = 'ℹ️';
    switch (event.type) {
      case 'agent:dead':
        icon = '🚨';
        break;
      case 'agent:recovered':
        icon = '✅';
        break;
      case 'agent:degraded':
        icon = '⚠️';
        break;
      case 'agent:registered':
        icon = '📡';
        break;
      case 'agent:deregistered':
        icon = '🏁';
        break;
    }

    const agent = event.agent;
    const textLines = [
      `${icon} *[Agent Beacon]* \`${event.type}\``,
      `*Agent:* \`${agent.id}\` (${escapeMd(agent.name)})`,
      `*Status:* *${agent.status}*`,
      `*TTL / Grace:* ${agent.ttlMs / 1000}s / ${agent.graceMs / 1000}s`,
      `*Total Pings:* ${agent.totalPings}`
    ];

    if (event.reason) {
      textLines.push(`*Details:* ${escapeMd(event.reason)}`);
    }

    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    const payload = {
      chat_id: this.chatId,
      text: textLines.join('\n'),
      parse_mode: 'Markdown'
    };

    await this.postJson(url, payload);
  }
}

function escapeMd(str: string): string {
  return str.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

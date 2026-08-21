/**
 * @nymrel/agent-beacon
 * Notifiers index and factory helpers.
 * Copyright (c) 2026 Nymrel / JalenBuilds LLC. MIT Licensed.
 */

export * from './base.js';
export * from './console.js';
export * from './discord.js';
export * from './slack.js';
export * from './telegram.js';
export * from './webhook.js';

import { Notifier } from '../core/types.js';
import { ConsoleNotifier } from './console.js';
import { DiscordNotifier } from './discord.js';
import { SlackNotifier } from './slack.js';
import { TelegramNotifier } from './telegram.js';
import { WebhookNotifier } from './webhook.js';

/**
 * Auto-detect notifier type from URL or connection string.
 */
export function createNotifierFromUrl(url: string, extraOptions: Record<string, unknown> = {}): Notifier {
  const trimmed = url.trim();

  if (trimmed.includes('discord.com/api/webhooks') || trimmed.includes('discordapp.com/api/webhooks')) {
    return new DiscordNotifier({ webhookUrl: trimmed, ...extraOptions });
  }

  if (trimmed.includes('hooks.slack.com/services/')) {
    return new SlackNotifier({ webhookUrl: trimmed, ...extraOptions });
  }

  if (trimmed.startsWith('telegram://') || trimmed.startsWith('tg://')) {
    // format: telegram://botToken:chatId
    const stripped = trimmed.replace(/^(telegram|tg):\/\//, '');
    const [botToken, chatId] = stripped.split(':');
    if (!botToken || !chatId) {
      throw new Error('Telegram connection URL must be in format: telegram://<BOT_TOKEN>:<CHAT_ID>');
    }
    return new TelegramNotifier({ botToken, chatId, ...extraOptions });
  }

  if (trimmed.startsWith('console')) {
    return new ConsoleNotifier(extraOptions);
  }

  // Fallback to standard HTTP/HTTPS webhook
  return new WebhookNotifier({ url: trimmed, ...extraOptions });
}

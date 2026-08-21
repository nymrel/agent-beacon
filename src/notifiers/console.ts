/**
 * @nymrel/agent-beacon
 * ConsoleNotifier: Formats beautiful ANSI-colored terminal output with status badges and audible alerts.
 * Copyright (c) 2026 Nymrel / JalenBuilds LLC. MIT Licensed.
 */

import { BeaconEvent } from '../core/types.js';
import { BaseNotifier } from './base.js';

export interface ConsoleNotifierOptions {
  /** Enable audible terminal bell on critical dead alerts (default: true) */
  audibleBell?: boolean;
  /** Filter enabled event types */
  enabledEvents?: string[];
  /** Custom output stream (default: process.stdout) */
  outStream?: NodeJS.WritableStream;
}

export class ConsoleNotifier extends BaseNotifier {
  public readonly name = 'console';
  private readonly audibleBell: boolean;
  private readonly outStream: NodeJS.WritableStream;

  constructor(options: ConsoleNotifierOptions = {}) {
    super(options.enabledEvents);
    this.audibleBell = options.audibleBell ?? true;
    this.outStream = options.outStream ?? process.stdout;
  }

  public async notify(event: BeaconEvent): Promise<void> {
    if (!this.shouldNotify(event)) return;

    const time = new Date(event.timestamp).toISOString().split('T')[1].replace('Z', '');
    const id = event.agentId;
    const name = event.agent.name !== id ? ` (${event.agent.name})` : '';

    let badge = '';
    let bell = '';

    switch (event.type) {
      case 'agent:dead':
        // Red badge
        badge = `\x1b[41m\x1b[37m\x1b[1m DEAD \x1b[0m`;
        if (this.audibleBell) bell = '\x07';
        break;
      case 'agent:recovered':
        // Green badge
        badge = `\x1b[42m\x1b[30m\x1b[1m RECOVERED \x1b[0m`;
        break;
      case 'agent:degraded':
        // Yellow badge
        badge = `\x1b[43m\x1b[30m\x1b[1m DEGRADED \x1b[0m`;
        break;
      case 'agent:registered':
        // Cyan badge
        badge = `\x1b[46m\x1b[30m\x1b[1m REGISTERED \x1b[0m`;
        break;
      case 'agent:deregistered':
        // Gray badge
        badge = `\x1b[100m\x1b[37m\x1b[1m RETIRED \x1b[0m`;
        break;
      default:
        badge = `\x1b[7m ${event.type.toUpperCase()} \x1b[0m`;
    }

    const reason = event.reason ? ` \x1b[90m— ${event.reason}\x1b[0m` : '';
    const tags = Object.keys(event.agent.tags).length > 0
      ? ` \x1b[36m[${Object.entries(event.agent.tags).map(([k, v]) => `${k}=${v}`).join(' ')}]\x1b[0m`
      : '';

    const line = `\x1b[90m[${time}]\x1b[0m ${badge} \x1b[1m${id}\x1b[0m${name}${tags}${reason}${bell}\n`;
    this.outStream.write(line);
  }
}

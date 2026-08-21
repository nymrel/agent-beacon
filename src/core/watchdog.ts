/**
 * @nymrel/agent-beacon
 * Watchdog engine: TTL expiration checker, dead-man's switch watchdog, and alert dispatcher.
 * Copyright (c) 2026 Nymrel / JalenBuilds LLC. MIT Licensed.
 */

import { EventEmitter } from 'node:events';
import { HeartbeatStore } from './store.js';
import {
  AgentRecord,
  BeaconConfig,
  BeaconEvent,
  HeartbeatPayload,
  Notifier
} from './types.js';

export class Watchdog extends EventEmitter {
  private readonly store: HeartbeatStore;
  private readonly checkIntervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private readonly notifiers: Notifier[] = [];
  private isRunning = false;

  constructor(store: HeartbeatStore, config: BeaconConfig = {}) {
    super();
    this.store = store;
    this.checkIntervalMs = config.checkIntervalMs ?? 1000;
  }

  /**
   * Add an alert notifier (e.g. Discord, Slack, Console, Webhook).
   */
  public addNotifier(notifier: Notifier): this {
    this.notifiers.push(notifier);
    return this;
  }

  /**
   * Get all registered notifiers.
   */
  public getNotifiers(): readonly Notifier[] {
    return this.notifiers;
  }

  /**
   * Start the periodic watchdog timer.
   */
  public start(): this {
    if (this.isRunning) return this;
    this.isRunning = true;
    this.timer = setInterval(() => this.checkLiveness(), this.checkIntervalMs);
    // Do not hold Node event loop open if watchdog is only thing running in scripts
    if (this.timer.unref) {
      this.timer.unref();
    }
    return this;
  }

  /**
   * Stop the watchdog timer.
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
   * Process an incoming heartbeat ping from an agent.
   */
  public recordPing(payload: HeartbeatPayload): AgentRecord {
    const result = this.store.registerOrUpdate(payload);
    const { record, isNew, previousStatus, statusChanged } = result;

    const pingEvent: BeaconEvent = {
      type: 'ping',
      agentId: record.id,
      timestamp: Date.now(),
      agent: record,
      previousStatus
    };
    this.emit('ping', pingEvent);
    this.emit('event', pingEvent);

    if (isNew) {
      const regEvent: BeaconEvent = {
        type: 'agent:registered',
        agentId: record.id,
        timestamp: Date.now(),
        agent: record
      };
      this.emit('agent:registered', regEvent);
      this.emit('event', regEvent);
      this.dispatchNotification(regEvent);
    } else if (statusChanged) {
      if (previousStatus === 'DEAD') {
        const recoveredEvent: BeaconEvent = {
          type: 'agent:recovered',
          agentId: record.id,
          timestamp: Date.now(),
          agent: record,
          previousStatus,
          reason: `Agent '${record.name}' revived and resumed heartbeats`
        };
        this.emit('agent:recovered', recoveredEvent);
        this.emit('event', recoveredEvent);
        this.dispatchNotification(recoveredEvent);
      } else if (record.status === 'HEALTHY') {
        const healthyEvent: BeaconEvent = {
          type: 'agent:healthy',
          agentId: record.id,
          timestamp: Date.now(),
          agent: record,
          previousStatus
        };
        this.emit('agent:healthy', healthyEvent);
        this.emit('event', healthyEvent);
      }
    }

    return record;
  }

  /**
   * Gracefully deregister an agent when work completes.
   */
  public deregister(agentId: string, reason = 'Agent completed task gracefully'): AgentRecord | null {
    const record = this.store.deregister(agentId, reason);
    if (!record) return null;

    const deregEvent: BeaconEvent = {
      type: 'agent:deregistered',
      agentId: record.id,
      timestamp: Date.now(),
      agent: record,
      reason
    };
    this.emit('agent:deregistered', deregEvent);
    this.emit('event', deregEvent);
    this.dispatchNotification(deregEvent);

    return record;
  }

  /**
   * Inspect all registered agents against TTL deadlines.
   */
  public checkLiveness(): void {
    const now = Date.now();
    const records = this.store.list();

    for (const record of records) {
      // Skip already retired or deregistered agents
      if (record.status === 'DEREGISTERED') {
        continue;
      }

      const elapsedMs = now - record.lastPingAt;
      const ttlDeadline = record.ttlMs;
      const deadDeadline = record.ttlMs + record.graceMs;

      if (elapsedMs > deadDeadline) {
        // Dead man's switch triggered!
        if (record.status !== 'DEAD') {
          const update = this.store.updateStatus(
            record.id,
            'DEAD',
            `Missed heartbeat deadline: ${Math.round(elapsedMs / 1000)}s elapsed (TTL: ${Math.round(record.ttlMs / 1000)}s + Grace: ${Math.round(record.graceMs / 1000)}s)`
          );
          if (update) {
            record.consecutiveMisses += 1;
            const deadEvent: BeaconEvent = {
              type: 'agent:dead',
              agentId: record.id,
              timestamp: now,
              agent: record,
              previousStatus: update.previousStatus,
              reason: `DEAD-MAN'S SWITCH TRIGGERED: Agent '${record.name}' (${record.id}) is unresponsive for ${Math.round(elapsedMs / 1000)}s.`
            };
            this.emit('agent:dead', deadEvent);
            this.emit('event', deadEvent);
            this.dispatchNotification(deadEvent);
          }
        }
      } else if (elapsedMs > ttlDeadline) {
        // Degraded: Missed TTL, within grace period
        if (record.status === 'HEALTHY') {
          const update = this.store.updateStatus(
            record.id,
            'DEGRADED',
            `Missed regular TTL interval (${Math.round(elapsedMs / 1000)}s > ${Math.round(record.ttlMs / 1000)}s)`
          );
          if (update) {
            const degradedEvent: BeaconEvent = {
              type: 'agent:degraded',
              agentId: record.id,
              timestamp: now,
              agent: record,
              previousStatus: update.previousStatus,
              reason: `Agent '${record.name}' is DEGRADED. Last seen ${Math.round(elapsedMs / 1000)}s ago (Grace window closing in ${Math.round((deadDeadline - elapsedMs) / 1000)}s).`
            };
            this.emit('agent:degraded', degradedEvent);
            this.emit('event', degradedEvent);
            this.dispatchNotification(degradedEvent);
          }
        }
      }
    }
  }

  private dispatchNotification(event: BeaconEvent): void {
    for (const notifier of this.notifiers) {
      // Fire-and-forget async execution with error isolation
      Promise.resolve()
        .then(() => notifier.notify(event))
        .catch((err) => {
          this.emit('error', new Error(`Notifier [${notifier.name}] failed on event ${event.type}: ${err instanceof Error ? err.message : String(err)}`));
        });
    }
  }
}

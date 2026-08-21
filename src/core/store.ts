/**
 * @nymrel/agent-beacon
 * In-memory HeartbeatStore for tracking agent liveness records.
 * Copyright (c) 2026 Nymrel / JalenBuilds LLC. MIT Licensed.
 */

import { AgentRecord, AgentStatus, BeaconConfig, FleetSummary, HeartbeatPayload, StatusTransition } from './types.js';

export interface UpdateResult {
  record: AgentRecord;
  isNew: boolean;
  previousStatus?: AgentStatus;
  statusChanged: boolean;
}

export class HeartbeatStore {
  private readonly records = new Map<string, AgentRecord>();
  private readonly defaultTtlMs: number;
  private readonly defaultGraceMs: number;
  private readonly historyLimit: number;

  constructor(config: BeaconConfig = {}) {
    this.defaultTtlMs = (config.defaultTtlSec ?? 30) * 1000;
    this.defaultGraceMs = (config.defaultGraceSec ?? 15) * 1000;
    this.historyLimit = config.historyLimit ?? 50;
  }

  /**
   * Register or refresh an agent record from a received heartbeat payload.
   */
  public registerOrUpdate(payload: HeartbeatPayload): UpdateResult {
    const now = Date.now();
    const id = payload.id.trim();
    if (!id) {
      throw new Error('Heartbeat payload missing required non-empty "id" field');
    }

    const ttlMs = payload.ttlSec ? payload.ttlSec * 1000 : this.defaultTtlMs;
    const graceMs = payload.graceSec ? payload.graceSec * 1000 : this.defaultGraceMs;
    const name = payload.name?.trim() || id;

    const existing = this.records.get(id);

    if (!existing) {
      // New registration
      const newStatus: AgentStatus = payload.status === 'degraded' ? 'DEGRADED' : 'HEALTHY';
      const record: AgentRecord = {
        id,
        name,
        status: newStatus,
        lastPingAt: now,
        firstSeenAt: now,
        ttlMs,
        graceMs,
        seq: payload.seq ?? 1,
        consecutiveMisses: 0,
        totalPings: 1,
        lastPayload: payload,
        tags: { ...(payload.tags ?? {}) },
        history: [
          {
            timestamp: now,
            from: 'DEREGISTERED',
            to: newStatus,
            reason: 'Initial registration'
          }
        ]
      };
      this.records.set(id, record);
      return {
        record,
        isNew: true,
        previousStatus: undefined,
        statusChanged: true
      };
    }

    // Updating existing record
    const previousStatus = existing.status;
    let targetStatus: AgentStatus = 'HEALTHY';
    if (payload.status === 'degraded') {
      targetStatus = 'DEGRADED';
    }

    const statusChanged = previousStatus !== targetStatus;

    existing.name = name;
    existing.lastPingAt = now;
    existing.ttlMs = ttlMs;
    existing.graceMs = graceMs;
    existing.seq = payload.seq ?? (existing.seq + 1);
    existing.consecutiveMisses = 0;
    existing.totalPings += 1;
    existing.lastPayload = payload;
    if (payload.tags) {
      existing.tags = { ...existing.tags, ...payload.tags };
    }

    if (statusChanged) {
      existing.status = targetStatus;
      const transition: StatusTransition = {
        timestamp: now,
        from: previousStatus,
        to: targetStatus,
        reason: previousStatus === 'DEAD' ? 'Agent recovered from dead state' : 'Heartbeat received'
      };
      this.appendHistory(existing, transition);
    }

    return {
      record: existing,
      isNew: false,
      previousStatus,
      statusChanged
    };
  }

  /**
   * Manually update the status of an agent (used by Watchdog).
   */
  public updateStatus(agentId: string, newStatus: AgentStatus, reason?: string): { record: AgentRecord; previousStatus: AgentStatus } | null {
    const record = this.records.get(agentId);
    if (!record) return null;

    const previousStatus = record.status;
    if (previousStatus === newStatus) return null;

    const now = Date.now();
    record.status = newStatus;

    const transition: StatusTransition = {
      timestamp: now,
      from: previousStatus,
      to: newStatus,
      reason
    };
    this.appendHistory(record, transition);

    return { record, previousStatus };
  }

  /**
   * Gracefully deregister an agent (e.g. clean worker shutdown).
   */
  public deregister(agentId: string, reason = 'Agent completed task gracefully'): AgentRecord | null {
    const record = this.records.get(agentId);
    if (!record) return null;

    const previousStatus = record.status;
    const now = Date.now();
    record.status = 'DEREGISTERED';

    const transition: StatusTransition = {
      timestamp: now,
      from: previousStatus,
      to: 'DEREGISTERED',
      reason
    };
    this.appendHistory(record, transition);

    return record;
  }

  /**
   * Retrieve a specific agent record.
   */
  public get(agentId: string): AgentRecord | undefined {
    return this.records.get(agentId);
  }

  /**
   * List all agent records.
   */
  public list(): AgentRecord[] {
    return Array.from(this.records.values());
  }

  /**
   * List agent records filtered by status.
   */
  public listByStatus(status: AgentStatus): AgentRecord[] {
    return Array.from(this.records.values()).filter((r) => r.status === status);
  }

  /**
   * Remove an agent entirely from the registry.
   */
  public remove(agentId: string): boolean {
    return this.records.delete(agentId);
  }

  /**
   * Clear all agent records.
   */
  public clear(): void {
    this.records.clear();
  }

  /**
   * Generate an aggregate fleet health summary.
   */
  public getFleetSummary(): FleetSummary {
    const now = Date.now();
    const all = Array.from(this.records.values());

    let healthy = 0;
    let degraded = 0;
    let dead = 0;
    let deregistered = 0;

    const agents = all.map((r) => {
      switch (r.status) {
        case 'HEALTHY':
        case 'RECOVERED':
          healthy++;
          break;
        case 'DEGRADED':
          degraded++;
          break;
        case 'DEAD':
          dead++;
          break;
        case 'DEREGISTERED':
          deregistered++;
          break;
      }

      return {
        id: r.id,
        name: r.name,
        status: r.status,
        lastPingAgeSec: Math.max(0, Math.round((now - r.lastPingAt) / 1000)),
        ttlSec: Math.round(r.ttlMs / 1000),
        graceSec: Math.round(r.graceMs / 1000),
        totalPings: r.totalPings,
        tags: r.tags
      };
    });

    return {
      timestamp: now,
      total: all.length,
      healthy,
      degraded,
      dead,
      deregistered,
      agents
    };
  }

  private appendHistory(record: AgentRecord, transition: StatusTransition): void {
    record.history.push(transition);
    if (record.history.length > this.historyLimit) {
      record.history.shift();
    }
  }
}

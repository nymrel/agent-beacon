/**
 * @nymrel/agent-beacon
 * Core type definitions for Agent Beacon liveness sentinel and watchdog mesh.
 * Copyright (c) 2026 Nymrel / JalenBuilds LLC. MIT Licensed.
 */

export type AgentStatus = 'HEALTHY' | 'DEGRADED' | 'DEAD' | 'RECOVERED' | 'DEREGISTERED';

export type EventType =
  | 'ping'
  | 'agent:registered'
  | 'agent:healthy'
  | 'agent:degraded'
  | 'agent:dead'
  | 'agent:recovered'
  | 'agent:deregistered'
  | 'alert';

export interface HeartbeatPayload {
  /** Unique identifier for the agent or worker */
  id: string;
  /** Human-readable agent display name or role (e.g. "Sol-Worker-Alpha") */
  name?: string;
  /** Expected heartbeat interval / TTL in seconds (default: 30) */
  ttlSec?: number;
  /** Grace period in seconds before transitioning from DEGRADED to DEAD (default: 15) */
  graceSec?: number;
  /** Monotonically increasing sequence number from the client */
  seq?: number;
  /** Client timestamp in milliseconds since epoch */
  timestamp?: number;
  /** Client-reported internal health status */
  status?: 'ok' | 'degraded' | 'done' | 'error';
  /** Optional telemetry metrics */
  metrics?: {
    cpuPercent?: number;
    memoryMb?: number;
    activeTasks?: number;
    tokensTotal?: number;
    stepIndex?: number;
    [key: string]: unknown;
  };
  /** Arbitrary string tags (e.g. env=prod, model=gpt-5.6-sol, host=vps-1) */
  tags?: Record<string, string>;
  /** Arbitrary metadata payload */
  metadata?: Record<string, unknown>;
}

export interface StatusTransition {
  timestamp: number;
  from: AgentStatus;
  to: AgentStatus;
  reason?: string;
}

export interface AgentRecord {
  id: string;
  name: string;
  status: AgentStatus;
  lastPingAt: number;
  firstSeenAt: number;
  ttlMs: number;
  graceMs: number;
  seq: number;
  consecutiveMisses: number;
  totalPings: number;
  lastPayload: HeartbeatPayload;
  tags: Record<string, string>;
  history: StatusTransition[];
}

export interface BeaconEvent {
  type: EventType;
  agentId: string;
  timestamp: number;
  agent: AgentRecord;
  previousStatus?: AgentStatus;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface BeaconConfig {
  /** Default TTL in seconds when not specified by agent (default: 30) */
  defaultTtlSec?: number;
  /** Default grace period in seconds (default: 15) */
  defaultGraceSec?: number;
  /** Watchdog tick interval in milliseconds (default: 1000) */
  checkIntervalMs?: number;
  /** Maximum number of history events per agent to retain (default: 50) */
  historyLimit?: number;
}

export interface FleetSummary {
  timestamp: number;
  total: number;
  healthy: number;
  degraded: number;
  dead: number;
  deregistered: number;
  agents: Array<{
    id: string;
    name: string;
    status: AgentStatus;
    lastPingAgeSec: number;
    ttlSec: number;
    graceSec: number;
    totalPings: number;
    tags: Record<string, string>;
  }>;
}

export interface Notifier {
  readonly name: string;
  notify(event: BeaconEvent): Promise<void>;
}

export interface PingClientOptions {
  /** Target beacon server URL (e.g. "http://127.0.0.1:8765") */
  beaconUrl: string;
  /** Unique ID for this agent */
  agentId: string;
  /** Human-readable display name */
  name?: string;
  /** Heartbeat interval in milliseconds (default: 15000) */
  intervalMs?: number;
  /** Server-side TTL in seconds (default: 30) */
  ttlSec?: number;
  /** Grace period in seconds (default: 15) */
  graceSec?: number;
  /** Auto-collect Node.js memory metrics */
  autoMetrics?: boolean;
  /** Default tags */
  tags?: Record<string, string>;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

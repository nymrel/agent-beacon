/**
 * @nymrel/agent-beacon
 * UDP Socket Server for ultra-low latency heartbeat datagrams.
 * Copyright (c) 2026 Nymrel / JalenBuilds LLC. MIT Licensed.
 */

import dgram from 'node:dgram';
import { HeartbeatPayload } from '../core/types.js';
import { Watchdog } from '../core/watchdog.js';

export interface UdpServerOptions {
  port?: number;
  host?: string;
}

export class BeaconUdpServer {
  private readonly watchdog: Watchdog;
  private socket: dgram.Socket | null = null;
  private readonly port: number;
  private readonly host: string;

  constructor(watchdog: Watchdog, options: UdpServerOptions = {}) {
    this.watchdog = watchdog;
    this.port = options.port ?? 8766;
    this.host = options.host ?? '127.0.0.1';
  }

  public async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.socket = dgram.createSocket('udp4');

      this.socket.on('error', (err) => {
        reject(err);
      });

      this.socket.on('message', (msg) => {
        this.handleMessage(msg);
      });

      this.socket.bind(this.port, this.host, () => {
        const addr = this.socket?.address();
        const actualPort = typeof addr === 'object' && addr ? addr.port : this.port;
        resolve(actualPort);
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.socket) {
        this.socket.close(() => resolve());
        this.socket = null;
      } else {
        resolve();
      }
    });
  }

  public getPort(): number | null {
    const addr = this.socket?.address();
    return typeof addr === 'object' && addr ? addr.port : null;
  }

  public getAddress(): string | null {
    const addr = this.socket?.address();
    return typeof addr === 'object' && addr ? addr.address : null;
  }

  private handleMessage(buffer: Buffer): void {
    const text = buffer.toString('utf-8').trim();
    if (!text) return;

    try {
      if (text.startsWith('{') && text.endsWith('}')) {
        const payload = JSON.parse(text) as HeartbeatPayload;
        if (payload.id) {
          this.watchdog.recordPing(payload);
          return;
        }
      }
    } catch {
      // Fallback: raw agent ID string
    }

    // Treat raw string as agentId
    if (text.length > 0 && text.length < 256) {
      this.watchdog.recordPing({
        id: text,
        timestamp: Date.now()
      });
    }
  }
}

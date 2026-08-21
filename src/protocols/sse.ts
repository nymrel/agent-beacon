/**
 * @nymrel/agent-beacon
 * Server-Sent Events (SSE) manager for live streaming beacon updates.
 * Copyright (c) 2026 Nymrel / JalenBuilds LLC. MIT Licensed.
 */

import http from 'node:http';
import { BeaconEvent } from '../core/types.js';

export class SseManager {
  private readonly clients = new Set<http.ServerResponse>();

  /**
   * Handle an incoming HTTP request and upgrade to an SSE stream.
   */
  public handleConnection(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // Send initial handshake comment
    res.write(': agent-beacon-sse-connected\n\n');

    this.clients.add(res);

    req.on('close', () => {
      this.clients.delete(res);
    });

    req.on('error', () => {
      this.clients.delete(res);
    });
  }

  /**
   * Broadcast an event to all connected SSE clients.
   */
  public broadcast(event: BeaconEvent): void {
    if (this.clients.size === 0) return;

    const data = JSON.stringify(event);
    const message = `event: ${event.type}\ndata: ${data}\n\n`;

    for (const client of this.clients) {
      try {
        client.write(message);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  /**
   * Close all active SSE connections.
   */
  public closeAll(): void {
    for (const client of this.clients) {
      try {
        client.end();
      } catch {
        // ignore
      }
    }
    this.clients.clear();
  }

  public get clientCount(): number {
    return this.clients.size;
  }
}

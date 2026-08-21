/**
 * @nymrel/agent-beacon
 * HeartbeatServer: Unified standalone server managing HTTP, UDP, Watchdog, Store, and Notifiers.
 * Copyright (c) 2026 Nymrel / JalenBuilds LLC. MIT Licensed.
 */

import { HeartbeatStore } from '../core/store.js';
import { BeaconConfig, Notifier } from '../core/types.js';
import { Watchdog } from '../core/watchdog.js';
import { BeaconHttpServer, HttpServerOptions } from '../protocols/http.js';
import { SseManager } from '../protocols/sse.js';
import { BeaconUdpServer, UdpServerOptions } from '../protocols/udp.js';

export interface HeartbeatServerOptions {
  http?: HttpServerOptions;
  udp?: UdpServerOptions | false;
  beacon?: BeaconConfig;
  notifiers?: Notifier[];
}

export class HeartbeatServer {
  private readonly store: HeartbeatStore;
  private readonly watchdog: Watchdog;
  private readonly sseManager: SseManager;
  private readonly httpServer: BeaconHttpServer;
  private readonly udpServer: BeaconUdpServer | null;

  constructor(options: HeartbeatServerOptions = {}) {
    this.store = new HeartbeatStore(options.beacon);
    this.watchdog = new Watchdog(this.store, options.beacon);
    this.sseManager = new SseManager();

    // Forward watchdog events to SSE stream
    this.watchdog.on('event', (event) => {
      this.sseManager.broadcast(event);
    });

    // Add configured notifiers
    if (options.notifiers) {
      for (const notifier of options.notifiers) {
        this.watchdog.addNotifier(notifier);
      }
    }

    this.httpServer = new BeaconHttpServer(
      this.store,
      this.watchdog,
      this.sseManager,
      options.http
    );

    if (options.udp !== false) {
      this.udpServer = new BeaconUdpServer(this.watchdog, typeof options.udp === 'object' ? options.udp : {});
    } else {
      this.udpServer = null;
    }
  }

  /**
   * Start HTTP, UDP, and Watchdog services.
   */
  public async start(): Promise<{ httpPort: number; udpPort: number | null }> {
    this.watchdog.start();
    const httpPort = await this.httpServer.start();
    let udpPort: number | null = null;
    if (this.udpServer) {
      udpPort = await this.udpServer.start();
    }
    return { httpPort, udpPort };
  }

  /**
   * Stop all servers and watchdog loop.
   */
  public async stop(): Promise<void> {
    this.watchdog.stop();
    await this.httpServer.stop();
    if (this.udpServer) {
      await this.udpServer.stop();
    }
  }

  public getStore(): HeartbeatStore {
    return this.store;
  }

  public getWatchdog(): Watchdog {
    return this.watchdog;
  }

  public addNotifier(notifier: Notifier): this {
    this.watchdog.addNotifier(notifier);
    return this;
  }

  public getHttpPort(): number | null {
    return this.httpServer.getPort();
  }

  public getUdpPort(): number | null {
    return this.udpServer ? this.udpServer.getPort() : null;
  }
}

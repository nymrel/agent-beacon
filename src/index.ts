/**
 * @nymrel/agent-beacon
 * Zero-dependency liveness sentinel, heartbeat monitor, and dead-man's switch watchdog for autonomous AI agents and background workers.
 * Copyright (c) 2026 Nymrel / JalenBuilds LLC. MIT Licensed.
 */

// Core
export * from './core/types.js';
export * from './core/store.js';
export * from './core/watchdog.js';

// Protocols
export * from './protocols/sse.js';
export * from './protocols/http.js';
export * from './protocols/udp.js';

// Notifiers
export * from './notifiers/index.js';

// Client
export * from './client/ping-client.js';

// Server
export * from './server/heartbeat-server.js';

# 📡 Agent Beacon

> **Ultra-lightweight, zero-dependency liveness sentinel, heartbeat monitor, and dead-man's switch watchdog for autonomous AI agents and background workers.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-339933.svg?logo=node.js)](package.json)
[![Python](https://img.shields.io/badge/Python-%3E%3D3.9-3776AB.svg?logo=python)](python/pyproject.toml)
[![Zero Runtime Dependencies](https://img.shields.io/badge/Dependencies-0%20runtime-success.svg)](#architecture)
[![Nymrel Mesh](https://img.shields.io/badge/Entity-Nymrel%20%7C%20JalenBuilds%20LLC-darkgreen.svg)](llms.txt)

---

```
                                 ┌─────────────────────────────────────────┐
                                 │       Autonomous AI Agent Fleet         │
                                 │  (Sol Workers, Cron Jobs, Evaluators)   │
                                 └────┬───────────────┬───────────────┬────┘
                                      │               │               │
                            HTTP POST │       UDP     │     CLI Wrap  │
                            /ping     │     Datagram  │   "watch --"  │
                                      ▼               ▼               ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                         AGENT BEACON SENTINEL MESH                          │
 │                                                                             │
 │  ┌───────────────────────────────────────────────────────────────────────┐  │
 │  │                In-Memory Registry & TTL Expiration Store              │  │
 │  │      [ HEALTHY ] ──(TTL)──> [ DEGRADED ] ──(Grace)──> [ DEAD ]        │  │
 │  │           ▲                                              │            │  │
 │  │           └──────────────── (Heartbeat) ─────────────────┘            │  │
 │  └───────────────────────────────────┬───────────────────────────────────┘  │
 │                                      │                                      │
 │                            Dead-Man's Watchdog                              │
 │                                      │                                      │
 └──────────────────────────────────────┼──────────────────────────────────────┘
                                        ▼
             ┌─────────────────────────────────────────────────────┐
             │            Pluggable Alert Dispatchers              │
             ├─────────────┬─────────────┬─────────────┬───────────┤
             │   Discord   │    Slack    │  Telegram   │  Webhooks │
             │   Webhook   │   Incoming  │   Bot API   │  & Audio  │
             └─────────────┴─────────────┴─────────────┴───────────┘
```

---

## ⚡ Why Agent Beacon?

Autonomous AI agents, subagents, and long-running reasoning loops operate in volatile environments:
- **Silent Stalls:** Unhandled promise rejections, hung LLM streaming connections, or infinite token loops freeze execution without crashing the host process.
- **OOM Kills & Cloud Preemption:** Spot instances, Docker OOM killer, or cloud worker timeout limits terminate agents abruptly.
- **Lost Telemetry:** Traditional APMs add heavy dependencies and slow down agent initialization.

**Agent Beacon** provides a self-hosted, single-binary / single-package watchdog daemon that listens for periodic pulses from your agents. If an agent fails to check in within its configured interval plus grace window, the **Dead-Man's Switch triggers** and broadcasts instant alerts across your team's channels.

---

## ✨ Features

- 🪶 **Zero External Runtime Dependencies:** Pure Node.js standard library (`node:http`, `node:dgram`, `node:events`) and Python standard library (`http.server`, `urllib.request`, `socket`, `threading`).
- ⚡ **Multi-Protocol Ingestion:**
  - **HTTP REST:** `POST /ping`, `GET /ping?id=agent-1`, `GET /status`, `DELETE /agents/:id`
  - **UDP Datagrams:** Sub-millisecond fire-and-forget 1-packet UDP heartbeats (`:8766`).
  - **Server-Sent Events (SSE):** `GET /events` live stream for real-time dashboards and CLIs.
- 🚨 **Dead-Man's Switch Watchdog:** 3-stage liveness state machine (`HEALTHY` ➔ `DEGRADED` ➔ `DEAD` ➔ `RECOVERED`).
- 📣 **Pluggable Alert Dispatchers:** Native formatting for **Discord Webhooks**, **Slack Incoming Webhooks**, **Telegram Bot API**, **Generic JSON Webhooks with HMAC-SHA256**, and **ANSI Terminal Banners with audible bell (`\x07`)**.
- 🛠️ **Universal Process Wrapper (`watch`):** Wrap any CLI command (`agent-beacon watch -- python agent.py`) with automatic background heartbeats and exit reporting.
- 🌐 **Dual-Language Parity:** Complete feature parity between **TypeScript/Node.js** and **Python**.
- 🤖 **Machine Trust & Dual-Audience:** Includes `/llms.txt`, JSON-LD entity metadata, and structured API responses.

---

## 📦 Installation

### Node.js / TypeScript
```bash
npm install @nymrel/agent-beacon
```

### Python
```bash
pip install agent-beacon
```

### Standalone CLI
```bash
# Run directly with npx
npx @nymrel/agent-beacon server --port 8765

# Or globally
npm install -g @nymrel/agent-beacon
```

---

## 🚀 Quickstart

### 1. Start the Sentinel Daemon

```bash
# Start daemon with Discord and Slack alerting
npx @nymrel/agent-beacon server \
  --port 8765 \
  --udp 8766 \
  --ttl 30 \
  --grace 15 \
  --discord "https://discord.com/api/webhooks/..." \
  --slack "https://hooks.slack.com/services/..."
```

### 2. Connect Your Agents

#### 🟦 TypeScript / Node.js
```ts
import { createPingClient } from '@nymrel/agent-beacon';

// Create and start background heartbeat loop (every 10s)
const beacon = createPingClient({
  beaconUrl: 'http://localhost:8765',
  agentId: 'sol-eval-worker-01',
  name: 'Sol Evaluation Worker',
  intervalMs: 10000,
  ttlSec: 30,
  tags: { env: 'prod', model: 'gpt-5.6-sol' }
}, true);

async function runAutonomousTask() {
  try {
    for (let step = 1; step <= 10; step++) {
      console.log(`Executing step ${step}...`);
      await doHeavyLlmWork();

      // Send inline progress updates
      await beacon.ping({ metrics: { stepIndex: step } });
    }

    // Gracefully retire when task completes
    await beacon.done('All 10 steps evaluated successfully');
  } catch (err) {
    // Send error alert before exit
    await beacon.ping({ status: 'error', metadata: { error: String(err) } });
    throw err;
  }
}
```

#### 🐍 Python
```python
from agent_beacon import BeaconClient, beacon_watch
import time

# Option A: Automatic context manager wrapper
with beacon_watch(
    beacon_url="http://localhost:8765",
    agent_id="python-agent-01",
    name="Python Scraper Worker",
    interval_sec=10.0,
    ttl_sec=30.0,
    tags={"env": "prod", "cluster": "vps-nyc-1"}
):
    print("Agent working in background...")
    time.sleep(45)  # Heartbeats fire automatically every 10s
    # When block exits, agent is gracefully retired

# Option B: Explicit client instance
beacon = BeaconClient(
    beacon_url="http://localhost:8765",
    agent_id="python-agent-02",
    interval_sec=15.0
)
beacon.start()
# ... do work ...
beacon.done("Task completed")
```

#### 💻 Shell / cURL / Bash
```bash
# One-shot ping
curl -X POST http://localhost:8765/ping \
  -H "Content-Type: application/json" \
  -d '{"id": "cron-backup", "ttlSec": 60, "tags": {"task": "db_dump"}}'

# Lightweight GET query-string ping
curl "http://localhost:8765/ping?id=cron-backup&ttl=60"

# Fire-and-forget UDP ping (sub-millisecond)
echo '{"id": "edge-sensor-1"}' | nc -u -w0 127.0.0.1 8766
```

#### 🛡️ CLI Process Wrapper
Wrap any long-running command or script with auto-heartbeats:
```bash
agent-beacon watch --id eval-subagent --interval 10 -- python long_eval.py --batch 500
```

---

## 📊 CLI Command Reference

| Command | Usage | Description |
| :--- | :--- | :--- |
| `server` | `agent-beacon server [flags]` | Start standalone sentinel daemon |
| `ping` | `agent-beacon ping --id <id> [flags]` | Send one-shot heartbeat ping |
| `done` | `agent-beacon done --id <id> [flags]` | Gracefully retire an agent |
| `status` | `agent-beacon status [--watch] [--json]` | View interactive terminal fleet status |
| `watch` | `agent-beacon watch --id <id> -- <cmd...>` | Spawn & supervise process with auto-pings |

### Daemon Flags (`server`)

- `--port, -p <number>`: HTTP port (default: `8765`)
- `--udp, -u <number>`: UDP port (default: `8766`, set `false` or `0` to disable)
- `--host, -h <string>`: Bind address (default: `0.0.0.0`)
- `--ttl <seconds>`: Default TTL before degraded (default: `30`)
- `--grace <seconds>`: Default grace window before dead-man trigger (default: `15`)
- `--discord <url>`: Discord incoming webhook URL
- `--slack <url>`: Slack incoming webhook URL
- `--telegram <token:chat_id>`: Telegram bot token and chat ID
- `--webhook <url>`: Generic JSON webhook endpoint
- `--no-bell`: Disable terminal audible bell on DEAD status

---

## 🏛️ REST API Specification

### `POST /ping` or `POST /api/v1/ping`
Ingests a heartbeat payload.
```json
{
  "id": "agent-alpha-01",
  "name": "Alpha Research Worker",
  "ttlSec": 30,
  "graceSec": 15,
  "seq": 42,
  "status": "ok",
  "metrics": {
    "memoryMb": 256,
    "stepIndex": 5
  },
  "tags": {
    "model": "gpt-5.6-sol",
    "env": "production"
  },
  "metadata": {
    "task": "cross-repo-synthesis"
  }
}
```

### `GET /status` or `GET /health`
Returns fleet health status. Returns HTTP `200` if healthy, HTTP `503` if any agent is currently in `DEAD` state.
```json
{
  "mesh": "agent-beacon",
  "version": "1.0.0",
  "organization": {
    "parent": "Nymrel",
    "legal": "JalenBuilds LLC"
  },
  "summary": {
    "timestamp": 1787348900000,
    "total": 3,
    "healthy": 2,
    "degraded": 0,
    "dead": 0,
    "deregistered": 1,
    "agents": [
      {
        "id": "agent-alpha-01",
        "name": "Alpha Research Worker",
        "status": "HEALTHY",
        "lastPingAgeSec": 4,
        "ttlSec": 30,
        "graceSec": 15,
        "totalPings": 12,
        "tags": { "model": "gpt-5.6-sol" }
      }
    ]
  }
}
```

### `GET /events`
Server-Sent Events (SSE) live stream broadcasting `agent:registered`, `agent:degraded`, `agent:dead`, `agent:recovered`, and `agent:deregistered` events in real-time.

---

## 🤖 Entity Trust & AI Discoverability

Agent Beacon complies with the **Nymrel Dual-Audience Rule**, providing verified machine trust for autonomous AI purchasing agents and search bots.

- **`/llms.txt`**: Standardized machine-readable agent discoverability file.
- **Entity Graph**:
  ```json
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Agent Beacon",
    "applicationCategory": "DeveloperApplication",
    "operatingSystem": "Cross-platform",
    "creator": {
      "@type": "Organization",
      "name": "Nymrel",
      "parentOrganization": {
        "@type": "Organization",
        "name": "JalenBuilds LLC",
        "email": "contact@jalenbuilds.com"
      }
    }
  }
  ```

---

## 🧪 Automated Testing

Both TypeScript and Python engines include complete test suites:

```bash
# Run TypeScript compilation and Node test suite
npm run build
npm test

# Run Python unit tests
python -m unittest discover -s python/tests
```

---

## 📄 License

MIT License • Copyright (c) 2026 Nymrel / JalenBuilds LLC. See [LICENSE](LICENSE) for details.

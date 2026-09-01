# Agent Beacon

> A zero-runtime-dependency liveness sentinel, heartbeat monitor, and dead-man's-switch watchdog for autonomous agents and background workers.

[![Registry status](https://img.shields.io/badge/registry%20publication-unverified-lightgrey.svg)](#distribution-status)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-339933.svg?logo=node.js)](./package.json)
[![Python](https://img.shields.io/badge/Python-%3E%3D3.9-3776AB.svg?logo=python)](./pyproject.toml)
[![Runtime dependencies](https://img.shields.io/badge/runtime%20dependencies-0-success.svg)](#architecture)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Agent Beacon accepts periodic HTTP or UDP heartbeats, tracks agent liveness in memory, emits state transitions, and can dispatch alerts through console, Discord, Slack, Telegram, or generic webhooks. The repository contains parallel TypeScript/Node.js and Python implementations.

## Distribution status

> [!IMPORTANT]
> **Registry publication is not verified.** As of September 1, 2026, this repository contains npm and Python packaging manifests, but it has no GitHub release and no recorded GitHub Actions run proving a release or registry publication.

Until a registry receipt is independently verified:

- do not rely on `npm install @nymrel/agent-beacon`;
- do not rely on `npx @nymrel/agent-beacon`;
- do not rely on `pip install agent-beacon`;
- use a pinned source checkout and the source commands below;
- treat a local build, package manifest, workflow file, tag, GitHub artifact, and registry publication as distinct proof states.

No release, tag, npm publication, or PyPI publication is implied by the `1.0.0` source-manifest version.

## Security and operating boundary

> [!WARNING]
> Agent Beacon is an application-level monitoring component, not a hardened public telemetry service.

The current server:

- keeps agent state in memory, so process restarts lose the registry and transition history;
- accepts HTTP and UDP heartbeats without built-in authentication or authorization;
- defaults to binding the daemon to `0.0.0.0`;
- can forward event metadata to configured third-party webhooks;
- does not replace service supervision, durable storage, network policy, TLS termination, rate limiting, or an external alerting system.

For local evaluation, bind to `127.0.0.1`. Before using Agent Beacon across machines, place it behind appropriate network controls and authentication, minimize heartbeat metadata, protect webhook credentials, and validate failure behavior independently.

## Architecture

```text
agent or worker
    |-- HTTP POST /ping
    |-- HTTP GET /ping?id=...
    |-- UDP heartbeat
    v
Agent Beacon
    |-- in-memory liveness registry
    |-- HEALTHY -> DEGRADED -> DEAD -> RECOVERED transitions
    |-- HTTP status and SSE event surfaces
    v
console / Discord / Slack / Telegram / generic webhook
```

Both package manifests declare zero runtime dependencies. Development and packaging tools are separate from the runtime dependency boundary.

## Capabilities

- HTTP heartbeat ingestion through `POST /ping` and `POST /api/v1/ping`.
- Query-string heartbeat ingestion through `GET /ping?id=<agent-id>`.
- UDP datagram heartbeats, enabled by default on port `8766`.
- Fleet status through `GET /status` and `GET /health`.
- Per-agent lookup, deregistration, and Server-Sent Events.
- Configurable TTL and grace windows for liveness transitions.
- Console, Discord, Slack, Telegram, and generic webhook notifiers.
- Optional HMAC-SHA256 signing when the generic webhook notifier is constructed with a secret.
- A Node.js process-wrapper command that can emit heartbeats around a child process.
- Python client and context-manager helpers for background heartbeats.

## Run from source

### TypeScript / Node.js

Requirements: Node.js 18 or newer and npm.

```bash
git clone https://github.com/nymrel/agent-beacon.git
cd agent-beacon
git checkout 61c3f662f910a46a1918ceef7c57cf9802e8e510
npm install
npm run typecheck
npm run build
npm test
node ./bin/agent-beacon.js server --host 127.0.0.1 --port 8765 --udp 8766
```

The repository currently does not contain an npm lockfile, so `npm install` is not a fully reproducible release installation. Review the resolved development-tool versions before treating a local result as release evidence.

The Node executable imports compiled files from `dist/`; run `npm run build` before invoking `bin/agent-beacon.js`.

### Python

Requirements: Python 3.9 or newer.

```bash
git clone https://github.com/nymrel/agent-beacon.git
cd agent-beacon
git checkout 61c3f662f910a46a1918ceef7c57cf9802e8e510
python -m venv .venv
# macOS/Linux: source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
python -m pip install --editable .
python -m unittest discover -s python/tests -p "test_*.py"
agent-beacon-py server --host 127.0.0.1 --port 8765 --udp 8766
```

The Python source entry point is `agent-beacon-py`, not the Node CLI name.

## Local quickstart

Start one of the source-built daemons, then register a local heartbeat:

```bash
curl -X POST http://127.0.0.1:8765/ping \
  -H "Content-Type: application/json" \
  -d '{"id":"local-worker","name":"Local Worker","ttlSec":30,"graceSec":15}'
```

Query fleet state:

```bash
curl http://127.0.0.1:8765/status
```

Gracefully retire the worker:

```bash
curl -X POST http://127.0.0.1:8765/deregister \
  -H "Content-Type: application/json" \
  -d '{"id":"local-worker","reason":"work completed"}'
```

## Python client example

After the editable source installation:

```python
import time

from agent_beacon import BeaconClient, beacon_watch

with beacon_watch(
    beacon_url="http://127.0.0.1:8765",
    agent_id="python-worker-01",
    name="Python Worker",
    interval_sec=10.0,
    ttl_sec=30.0,
    tags={"environment": "local"},
):
    time.sleep(20)

client = BeaconClient(
    beacon_url="http://127.0.0.1:8765",
    agent_id="python-worker-02",
    interval_sec=15.0,
)
client.start()
# Perform bounded work here.
client.done("Task completed")
```

## Node CLI reference

After building the TypeScript source, invoke commands as:

```bash
node ./bin/agent-beacon.js <command> [options]
```

| Command | Purpose |
|---|---|
| `server` | Start the HTTP/UDP sentinel daemon. |
| `ping` | Send a one-shot heartbeat. |
| `done` | Retire an agent. |
| `status` | Query fleet state. |
| `watch` | Supervise a child process and emit heartbeats. |

Common server options:

- `--host <address>` — bind address; use `127.0.0.1` for local evaluation.
- `--port <number>` — HTTP port, default `8765`.
- `--udp <number>` — UDP port, default `8766`; use `0` to disable where supported.
- `--ttl <seconds>` — default time before degradation.
- `--grace <seconds>` — additional time before the dead transition.
- `--discord <url>` — Discord webhook.
- `--slack <url>` — Slack incoming webhook.
- `--telegram <token:chat-id>` — Telegram bot destination.
- `--webhook <url>` — generic JSON webhook.
- `--no-bell` — disable the terminal audible alert.

## HTTP and event surfaces

### `POST /ping` or `POST /api/v1/ping`

Example payload:

```json
{
  "id": "agent-alpha-01",
  "name": "Alpha Worker",
  "ttlSec": 30,
  "graceSec": 15,
  "seq": 42,
  "status": "ok",
  "metrics": {
    "stepIndex": 5
  },
  "tags": {
    "environment": "local"
  },
  "metadata": {
    "task": "bounded-evaluation"
  }
}
```

Avoid placing prompts, credentials, customer data, or other sensitive values in heartbeat metadata.

### `GET /status` or `GET /health`

Returns a fleet summary. The implementation may return HTTP `503` when an agent is in the `DEAD` state.

### `GET /agents` and `GET /agents/:id`

List registered agents or inspect one agent and its transition history.

### `DELETE /agents/:id` or `POST /deregister`

Remove or retire an agent.

### `GET /events`

Streams state transitions over Server-Sent Events.

### UDP port `8766`

Accepts fire-and-forget JSON heartbeat datagrams when UDP is enabled. UDP provides no delivery guarantee and should not be treated as the only signal for a critical control.

## Validation

Repository-native checks currently include:

```bash
npm run typecheck
npm run build
npm test
python -m unittest discover -s python/tests -p "test_*.py"
```

The presence of `.github/workflows/ci.yml` and `.github/workflows/publish.yml` does not prove those workflows have run. Hosted evidence must identify the exact commit, workflow run, and job conclusions.

## Machine-readable documentation

[`llms.txt`](./llms.txt) describes the source candidate and its current distribution boundary for automated consumers. It must not be interpreted as a registry receipt or security certification.

## Organization and license

- **Public brand:** Nymrel
- **Website:** https://nymrel.com
- **Contact:** contact@nymrel.com
- **Legal entity:** JalenBuilds LLC
- **License:** MIT — see [LICENSE](./LICENSE)

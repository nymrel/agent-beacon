# Security Policy

## Reporting a Vulnerability

We take the security of `agent-beacon` and the Nymrel mesh seriously. If you discover a vulnerability or security flaw, please report it responsibly:

- **Email:** `contact@nymrel.com`
- **Subject:** `[SECURITY] Vulnerability in agent-beacon`
- **Entity:** Nymrel / JalenBuilds LLC

Please include:
1. Description of the vulnerability and affected components.
2. Steps to reproduce or proof-of-concept script.
3. Impact assessment.

Nymrel will review reports and respond when capacity permits. No guaranteed acknowledgement or remediation service level is offered for this pre-release project.

## Supported Versions

Agent Beacon has not been published to npm or PyPI and has no generally supported release line. The version currently present in repository manifests is pre-release source metadata, not a production support commitment.

| Distribution | Published | Supported for production |
| --- | --- | --- |
| npm `@nymrel/agent-beacon` | No | No |
| PyPI `agent-beacon` | No | No |

## Security Boundary

- The current sentinel stores agent state in memory. Restarts lose that state, and a single process does not provide high availability.
- The HTTP and UDP ingestion surfaces do not provide built-in caller authentication, authorization, rate limiting, or tenant isolation.
- Alert delivery is best effort. Network failures, invalid credentials, provider outages, and process termination can prevent notification.
- Do not expose the server directly to an untrusted network. Place it behind an authenticated, rate-limited network boundary and avoid putting secrets or sensitive payloads in heartbeat metadata.
- Treat webhook URLs and Telegram credentials as secrets. Keep them out of source control, command history, screenshots, and issue reports.
- Do not use Agent Beacon as the sole monitor, incident-response channel, or durable audit system for safety-critical or production-critical workloads.

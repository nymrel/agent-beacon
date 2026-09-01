# Security Policy

## Reporting a vulnerability

Report suspected Agent Beacon vulnerabilities privately to **contact@nymrel.com** with the subject `[SECURITY] Agent Beacon vulnerability`.

Include, where safe:

- the affected commit, file, entry point, and runtime;
- a minimal reproduction using synthetic data;
- expected and observed behavior;
- likely impact and whether the issue is remotely reachable;
- mitigations already tested.

Do not place live credentials, webhook tokens, private customer data, destructive payloads, or an undisclosed exploit in a public issue. Nymrel will coordinate acknowledgment and disclosure through the reporting channel; this public repository does not promise a fixed response or remediation SLA.

## Current support state

Agent Beacon is currently maintained as a source candidate. The `1.0.0` manifest version does not, by itself, prove an npm package, PyPI package, GitHub release, or supported production distribution.

Security fixes should target the current default branch unless a published release and explicit support matrix are independently verified. No historical registry version is declared supported by this file.

## Security boundary

The current implementation is an application-level liveness monitor:

- state is stored in memory;
- HTTP and UDP heartbeat ingestion have no built-in authentication or authorization;
- the daemon defaults to `0.0.0.0`;
- event metadata may be forwarded to configured notification services;
- UDP delivery is best effort;
- no durable queue, database, TLS termination, network isolation, service supervision, or rate limiting is provided by this repository.

Use loopback binding for local evaluation. A networked deployment requires an independently reviewed trust boundary, authentication, transport security, traffic controls, secret management, metadata minimization, durable-state decision, and failure-mode testing.

## High-value report areas

Reports are especially useful when they demonstrate:

- unauthenticated state mutation or data exposure beyond the documented boundary;
- request-body or datagram resource exhaustion;
- webhook credential or metadata disclosure;
- command-injection or argument-boundary errors in the process wrapper;
- path, URL, redirect, or server-side request-forgery problems;
- liveness-state transitions that suppress or duplicate critical alerts;
- package or release-workflow integrity failures.

## Disclosure boundary

A local test, package build, workflow definition, tag, artifact, or source-manifest version is not a publication or security-certification receipt. Public advisories should identify the exact affected commit or independently verified package version.

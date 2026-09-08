# Changelog

All notable changes will be documented in this file. Agent Beacon remains pre-release and unpublished.

## Unreleased

### Changed

- Consolidated Python packaging on a single PEP 517/Hatchling configuration.
- Added locked Node.js development dependencies and explicit supported runtime ranges.
- Added cross-platform, distribution-contract, dependency-audit, static-analysis, and workflow-security gates.
- Replaced automatic publication with an explicit, tag-bound, OIDC-only release workflow.
- Clarified the in-memory, unauthenticated, best-effort operating boundary and unpublished package status.
- Changed both server implementations to bind loopback by default and reject non-HTTP(S), credential-bearing outbound URLs.

### Security

- Pinned third-party GitHub Actions to immutable revisions and reduced workflow permissions per job.
- Removed token-based npm publishing from the release contract.

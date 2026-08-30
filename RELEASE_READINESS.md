# Agent Beacon release readiness

Status: **HOLD — source candidate only**

Evidence date: 2026-08-30

Agent Beacon is not published on npm or PyPI. This repository can be evaluated from source, but publication and production support are separate operator-controlled decisions.

## Candidate gates

- [x] One canonical Node.js manifest and one canonical Python `pyproject.toml`.
- [x] Exact development-tool versions and a committed npm lockfile contract.
- [x] Node.js 22, 24, and 26 plus Python 3.11–3.14 CI definitions.
- [x] Linux, macOS, and Windows workflow coverage.
- [x] npm and Python archive-content validation.
- [x] Dependency audit, Ruff, Bandit, actionlint, and Zizmor definitions.
- [x] Immutable third-party action revisions and least-privilege job permissions.
- [x] Manual, existing-tag-only publishing with matching ecosystem versions.
- [x] Artifact checksums, build provenance attestations, and OIDC-only registry publication definitions.
- [x] Honest source-evaluation, support, and security-boundary documentation.
- [x] Loopback-by-default listeners and shared HTTP(S)-only outbound target validation in both implementations.

These checkboxes describe the candidate contract. The pull request or commit acceptance receipt must record the exact commands and results before this document may be cited as local validation evidence.

## Gates that remain outside the source candidate

- [ ] Independent exact-commit review is accepted.
- [ ] Candidate is integrated into `main`; a reviewed semantic-version tag exists on that integrated commit.
- [ ] GitHub Actions is enabled for the account and the candidate workflow completes successfully on hosted runners.
- [ ] Protected `npm` and `pypi` environments require operator approval.
- [ ] npm and PyPI OIDC trusted publishers are configured for the exact repository, workflow, and environments.
- [ ] The operator approves publication and selects `confirmation=publish` for the exact tag.
- [ ] Registry pages, package digests, provenance, and clean-room installs are independently verified after publication.
- [ ] A production operating model exists for authentication, rate limiting, durable state, redundancy, alert-delivery monitoring, and support ownership.

## Release invariants

1. Never infer publication from a version string, source archive, passing tests, or workflow definition.
2. Never create or move a release tag inside the publishing workflow.
3. Never publish a commit that is not an ancestor of `origin/main`.
4. Never substitute long-lived npm or PyPI tokens for the OIDC trusted-publisher boundary.
5. Never call the current in-memory, unauthenticated server production-ready without a separately accepted deployment architecture.

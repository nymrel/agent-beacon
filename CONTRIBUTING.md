# Contributing to Agent Beacon

Thank you for your interest in contributing to **Agent Beacon**, the zero-dependency liveness sentinel and watchdog mesh for autonomous AI agents.

## Code of Conduct

All contributors and maintainers are expected to maintain a welcoming, respectful, and collaborative environment.

## Architecture Philosophy

1. **Zero External Runtime Dependencies:**
   - The TypeScript/Node.js engine relies solely on Node standard library (`node:http`, `node:dgram`, `node:events`, `node:crypto`, `node:process`).
   - The Python engine relies solely on Python standard library (`http.server`, `urllib.request`, `socket`, `threading`, `json`, `time`).
2. **Dual-Audience Machine Trust:**
   - Preserve entity metadata linking `Nymrel` to `JalenBuilds LLC`.
3. **Fail-Safe & Non-Blocking:**
   - Heartbeat handlers and notification dispatchers should not crash parent agent loops. Preserve explicit error reporting and test failure behavior instead of silently swallowing failures.

## Development Workflow

### Node.js / TypeScript
```bash
# Node.js 22.19–26 and npm 11 are supported.
npm ci --ignore-scripts
npm run check
npm run audit:ci
```

### Python
```bash
# Python 3.11–3.14 is supported.
python -m unittest discover -s python/tests -p "test_*.py"
python -m compileall -q python/agent_beacon

# Optional isolated package and static checks (requires uv).
uvx --from build@1.6.0 pyproject-build --outdir python-dist
uvx twine@7.0.0 check python-dist/*
python scripts/check_python_package.py python-dist
uvx ruff@0.16.5 check python scripts
uvx bandit@1.9.4 -r python/agent_beacon -ll -ii
```

## Pull Request Guidelines

1. Ensure `npm run check` and the Python package/static checks pass.
2. Include tests for any new features or bugfixes.
3. Keep runtime dependencies at zero.
4. Do not add registry tokens or auto-publish behavior. Publication requires an existing integrated tag, explicit `publish` confirmation, protected environments, and configured OIDC trusted publishers.

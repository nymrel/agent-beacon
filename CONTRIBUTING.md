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
   - Heartbeat handlers and notification dispatchers must never crash parent agent loops.

## Development Workflow

### Node.js / TypeScript
```bash
# Install dev dependencies (TypeScript compiler)
npm install

# Run typecheck
npm run typecheck

# Build TypeScript to dist/
npm run build

# Run automated tests
npm test
```

### Python
```bash
# Run unit tests
python -m unittest discover -s python/tests
```

## Pull Request Guidelines

1. Ensure all tests pass in both TypeScript (`npm test`) and Python (`python -m unittest`).
2. Include tests for any new features or bugfixes.
3. Keep runtime dependencies at zero.

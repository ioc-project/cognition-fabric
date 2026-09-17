# IOC Scale CF - Cognition Engines

Repository for Cognition Engines (CEs) - intelligent decision-making services for the IOC platform.

## Structure

```
ioc-scale-cf-cognition-engines/
├── engines/              # All cognition engines
│   └── casa/            # CASA Cognition Engine
│       ├── src/         # Python source code
│       ├── proto/       # Protocol Buffer definitions
│       ├── tests/       # Unit tests
│       ├── Dockerfile   # Container build
│       └── README.md    # Engine-specific docs
└── docker-compose.yml   # Run all services locally
```

## Quick Start

### Run All Engines

```bash
docker-compose up
```

### Run Specific Engine

```bash
docker-compose up casa-ce
```

### Stop Services

```bash
docker-compose down
```

## Available Engines

### CASA Cognition Engine

**Location:** `engines/casa/`  
**Port:** 50051 (gRPC)  
**Protocol:** gRPC (`ioc.ce.v1.CognitionEngine`)

CASA (Continuous Agent Semantic Authorization) Cognition Engine Service implementing the `ioc.ce.v1.CognitionEngine` gRPC contract.

**Features:**

- `Evaluate` RPC - Authorization decision for in-scope MAS actions
- `GetInfo` RPC - Returns CE capabilities and enabled checks
- CFN registration on startup (idempotent)
- Periodic heartbeats to maintain "online" status
- Cognition Store integration for MAS-level context

See [engines/casa/README.md](engines/casa/README.md) for details.

## Development

### Run Locally (without Docker)

```bash
cd engines/casa
uv sync
uv run python -m src.service
```

### Run Tests

```bash
cd engines/casa
uv run pytest -v
```

## CI/CD & Releases

### Continuous Integration

CI uses **matrix strategy** to build all CEs in parallel. When you add a new CE, update `.github/workflows/ci.yaml`:

```yaml
strategy:
  matrix:
    ce:
      - name: casa-ce
        path: engines/casa
        dockerfile: engines/casa/Dockerfile
        pyproject: engines/casa/pyproject.toml
      - name: your-new-ce    # Add your CE here
        path: engines/your-new-ce
        dockerfile: engines/your-new-ce/Dockerfile
        pyproject: engines/your-new-ce/pyproject.toml
```

CI automatically runs on:
- **Pull Requests** - Build validation only (no push)
- **Main branch** - Build + push `:latest` + `:YYYY-MM-DD-<sha>`
- **Tags** - Build + push `:<tag-name>` (semantic version)

### Docker Images

Images are published to GitHub Container Registry:

```
ghcr.io/cisco-eti/ioc-scale-cf-cognition-engines/casa-ce:latest
ghcr.io/cisco-eti/ioc-scale-cf-cognition-engines/casa-ce:v0.1.0
```

## Contributing

1. Create your engine in `engines/<name>/`
2. Add gRPC proto definitions in `engines/<name>/proto/`
3. Implement the service in `engines/<name>/src/`
4. Add tests in `engines/<name>/tests/`
5. Add it to `docker-compose.yml`
6. Document it in your engine's `README.md`
7. Test locally
8. Submit PR

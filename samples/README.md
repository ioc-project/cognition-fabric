# IOC Scale CF - Cognition Engines

Repository for Cognition Engines (CEs) - intelligent decision-making services for the IOC platform.

## Structure

```
ioc-scale-cf-demo-ce/
├── demo-ce/              # Demo CE Cognition Engine
│   ├── src/              # Python source code
│   ├── proto/            # Protocol Buffer definitions
│   ├── tests/            # Unit tests
│   ├── Dockerfile        # Container build
│   └── README.md         # Engine-specific docs
└── docker-compose.yml    # Run all services locally
```

## Quick Start

### Run All Engines

```bash
docker-compose up
```

### Run Specific Engine

```bash
docker-compose up demo-ce
```

### Stop Services

```bash
docker-compose down
```

## Available Engines

### Demo CE Cognition Engine

**Location:** `demo-ce/`  
**Port:** 50051 (gRPC)  
**Protocol:** gRPC (`ioc.ce.v1.CognitionEngine`)

Demo CE Cognition Engine Service implementing the `ioc.ce.v1.CognitionEngine` gRPC contract.

**Features:**

- `Evaluate` RPC - Authorization decision for in-scope MAS actions
- `GetInfo` RPC - Returns CE capabilities and enabled checks
- CFN registration on startup (idempotent)
- Periodic heartbeats to maintain "online" status
- Cognition Store integration for MAS-level context

See [demo-ce/README.md](demo-ce/README.md) for details.

## Development

### Run Locally (without Docker)

```bash
cd demo-ce
uv sync
uv run python -m src.service
```

### Run Tests

```bash
cd demo-ce
uv run pytest -v
```

## CI/CD & Releases

### Continuous Integration

CI uses **matrix strategy** to build all CEs in parallel. When you add a new CE, update `.github/workflows/ci.yaml`:

```yaml
strategy:
  matrix:
    ce:
      - name: demo-ce
        path: demo-ce
        dockerfile: demo-ce/Dockerfile
        pyproject: demo-ce/pyproject.toml
      - name: your-new-ce    # Add your CE here
        path: your-new-ce
        dockerfile: your-new-ce/Dockerfile
        pyproject: your-new-ce/pyproject.toml
```

CI automatically runs on:
- **Pull Requests** - Build validation only (no push)
- **Main branch** - Build + push `:latest` + `:YYYY-MM-DD-<sha>`
- **Tags** - Build + push `:<tag-name>` (semantic version)

### Docker Images

Images are published to GitHub Container Registry:

```
ghcr.io/cisco-eti/ioc-scale-cf-demo-ce/demo-ce:latest
ghcr.io/cisco-eti/ioc-scale-cf-demo-ce/demo-ce:v0.1.0
```

## Contributing

1. Create your engine in `<name>/`
2. Add gRPC proto definitions in `<name>/proto/`
3. Implement the service in `<name>/src/`
4. Add tests in `<name>/tests/`
5. Add it to `docker-compose.yml`
6. Document it in your engine's `README.md`
7. Test locally
8. Submit PR

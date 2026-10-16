# IOC Scale CF - Demo CE

Demo Cognition Engine (CE) for the IOC platform.

## Structure

```
ioc-scale-cf-demo-ce/
├── demo-ce/              # Demo CE Cognition Engine
│   ├── src/              # Python source code
│   ├── proto/            # Protocol Buffer definitions
│   ├── tests/            # Unit tests
│   ├── Dockerfile        # Container build
│   └── README.md         # Engine-specific docs
├── policy-ce/            # Policy-driven CE (Go), see policy-ce/README.md
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

### Policy CE

**Location:** `policy-ce/`  
**Port:** 18001 (gRPC, `ioc.ce.v1.CognitionEngine`)

Application-agnostic CE that loads identity and content rules for one or several MAS from a `policy.json`.
Go service derived from the NOA demo's Fake CE. See [policy-ce/README.md](policy-ce/README.md).

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

`.github/workflows/ci.yaml` has one set of jobs per CE (there is no matrix). When you add a new CE, add its own
unit-test and Docker build jobs and list them in `needs` of `reusable-workflow-ci-status`, the required status job.

| CE | Jobs | Notes |
|---|---|---|
| `demo-ce` (Python) | `checkout-unit-tests`, `docker-build-push` | Tags (`vX.Y.Z`) version this CE; `validate-semver` checks them against `demo-ce/pyproject.toml` |
| `policy-ce` (Go) | `policy-ce-unit-tests`, `policy-ce-docker-build-push` | Needs a short-lived token for the private `cisco-eti/ioc-scale-cfn-svc` module, issued through Vault by `.github/actions/cfn-token` (vars `KEEPER_URL`, `VAULT_NAMESPACE`, `VAULT_SECRET_PATH`; secrets `VAULT_APPROLE_ROLE_ID`, `VAULT_APPROLE_SECRET_ID`); images are published from `main` only |

CI automatically runs on:
- **Pull Requests** - Unit tests + Docker build validation (no push)
- **Main branch** - Build + push `:latest` + `:YYYY-MM-DD-<sha>`
- **Tags** - `demo-ce` only: build + push `:<tag-name>` (semantic version)

### Docker Images

Images are published to GitHub Container Registry:

```
ghcr.io/cisco-eti/ioc-scale-cf-demo-ce/ce-demo:latest
ghcr.io/cisco-eti/ioc-scale-cf-demo-ce/ce-demo:v0.1.0
ghcr.io/cisco-eti/ioc-scale-cf-demo-ce/policy-ce:latest
```

## Contributing

1. Create your engine in `<name>/`
2. Implement the `ioc.ce.v1.CognitionEngine` contract:
   - Python (see `demo-ce/`): proto definitions in `<name>/proto/`, service in `<name>/src/`, tests in `<name>/tests/`
   - Go (see `policy-ce/`): the contract comes from the `ioc-scale-cfn-svc` Go module; `cmd/`, `internal/` and `pkg/`, with the tests next to the code
3. Add it to `docker-compose.yml`
4. Add its jobs to `.github/workflows/ci.yaml` and to `needs` of `reusable-workflow-ci-status`
5. Document it in your engine's `README.md`
6. Test locally
7. Submit PR

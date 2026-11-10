# IOC Scale CF - Demo CE

Cognition Engines (CEs) for the IOC platform: a Python implementation template and the Go Demo CE.

## Documentation

The [documentation](https://refactored-carnival-2m9k3yw.pages.github.io/) covers Demo CE and Template CE,
including setup, evaluation flow, configuration and the recording walkthrough.
See [docs/README.md](docs/README.md) to preview or build the Docusaurus site locally.

## Structure

```
ioc-scale-cf-demo-ce/
├── template-ce/          # CE implementation template, not deployed by Compose
│   ├── src/              # Python source code
│   ├── proto/            # Protocol Buffer definitions
│   ├── tests/            # Unit tests
│   ├── Dockerfile        # Container build
│   └── README.md         # Engine-specific docs
├── demo-ce/              # Demo CE (Go), see demo-ce/README.md
└── docker-compose.yml    # Run demo-ce locally
```

## Quick Start

### Run Demo CE

Export `GITHUB_TOKEN` with read access to the private `cisco-eti/ioc-scale-cfn-svc` module, and configure
`demo-ce/config/config.json` with your MAS and agent identities. From the repository root:

```bash
docker compose up --build
```

For the recording, follow the [colored demo logs](demo-ce/README.md#demo-logs), including the complete CFN request and OXP/Store flow.

Compose runs only `demo-ce`. The Python `template-ce/` implementation remains available as a template
for CE teams; see its [local development instructions](template-ce/README.md#run-locally-without-docker).

### Stop Services

```bash
docker compose down
```

## Available Engines

### Template CE Cognition Engine

**Location:** `template-ce/`\
**Port:** 50051 (gRPC), 8080 (HTTP health)  
**Protocol:** gRPC (`ioc.ce.v1.CognitionEngine`)

Template CE Cognition Engine Service implementing the `ioc.ce.v1.CognitionEngine` gRPC contract.
It is maintained as an implementation template and is not included in the Compose deployment.

**Features:**

- `Evaluate` RPC - Authorization decision for in-scope MAS actions
- `GetInfo` RPC - Returns CE capabilities and enabled checks
- CFN registration on startup (idempotent)
- `GET /healthz` endpoint that CFN probes to track "online" status
- Cognition Store integration for MAS-level context

See [template-ce/README.md](template-ce/README.md) for details.

### Demo CE

**Location:** `demo-ce/`\
**Port:** 18001 (gRPC, `ioc.ce.v1.CognitionEngine`)

Demonstration CE that loads identity and content rules for one or several MAS from `config.json`.
Go service derived from the NOA demo's Fake CE. See [demo-ce/README.md](demo-ce/README.md).

## Development

### Run Locally (without Docker)

```bash
cd template-ce
uv sync --extra test
HEALTH_PORT=8081 uv run python -m src
```

### Run Tests

```bash
cd template-ce
uv sync --extra test
uv run pytest -v
```

## CI/CD & Releases

### Continuous Integration

`.github/workflows/ci.yaml` tests and builds `demo-ce` and `template-ce`. When you add a deployed CE,
add its unit-test and Docker build jobs and list them in `needs` of `reusable-workflow-ci-status`,
the required status job.

| CE | Jobs | Notes |
|---|---|---|
| `demo-ce` (Go) | `demo-ce-unit-tests`, `demo-ce-docker-build-push` | Needs a short-lived token for the private `cisco-eti/ioc-scale-cfn-svc` module, issued through Vault by `.github/actions/cfn-token` (vars `KEEPER_URL`, `VAULT_NAMESPACE`, `VAULT_SECRET_PATH`; secrets `VAULT_APPROLE_ROLE_ID`, `VAULT_APPROLE_SECRET_ID`); `ci.yaml` publishes from `main` only |
| `template-ce` (Python) | `template-ce-unit-tests`, `template-ce-docker-build-push` | No private CFN module; `ci.yaml` publishes from `main` only |

CI (`ci.yaml`) automatically runs on:
- **Pull Requests** - Unit tests + Docker build validation (no push)
- **Main branch** - Build + push `:latest` + `:YYYY-MM-DD-<sha>`
- **Manual runs** - Unit tests + Docker build validation (no push)

Tag pushes run `.github/workflows/release.yaml` instead. Supported names are
`vX.Y.Z` or a prerelease such as `v1.2.3-rc.1`. The Docker tag equals the Git
tag and does not move `latest`. A Git tag names a commit, not a branch; the
tagged commit must contain this workflow. Who may push tags is the SRE process
in `CONTRIBUTING.md`. Operator selection is documented in the CFN repository
[`deploy/README.md`](https://github.com/cisco-eti/ioc-scale-cfn-svc/blob/main/deploy/README.md).

### Docker Images

Images are published to GitHub Container Registry:

```
ghcr.io/cisco-eti/ioc-scale-cf-demo-ce/demo-ce:latest
ghcr.io/cisco-eti/ioc-scale-cf-demo-ce/demo-ce:YYYY-MM-DD-<sha>
ghcr.io/cisco-eti/ioc-scale-cf-demo-ce/demo-ce:vX.Y.Z
ghcr.io/cisco-eti/ioc-scale-cf-demo-ce/template-ce:latest
ghcr.io/cisco-eti/ioc-scale-cf-demo-ce/template-ce:YYYY-MM-DD-<sha>
ghcr.io/cisco-eti/ioc-scale-cf-demo-ce/template-ce:vX.Y.Z
```

## Contributing

1. Create your engine in `<name>/`
2. Implement the `ioc.ce.v1.CognitionEngine` contract:
   - Python (see `template-ce/`): proto definitions in `<name>/proto/`, service in `<name>/src/`, tests in `<name>/tests/`
   - Go (see `demo-ce/`): the contract comes from the `ioc-scale-cfn-svc` Go module; `cmd/`, `internal/` and `pkg/`, with the tests next to the code
3. Add it to `docker-compose.yml`
4. Add its jobs to `.github/workflows/ci.yaml` and to `needs` of `reusable-workflow-ci-status`, and the corresponding tag-publish jobs to `.github/workflows/release.yaml`
5. Document it in your engine's `README.md`
6. Test locally
7. Submit PR

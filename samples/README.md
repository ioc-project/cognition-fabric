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

For local issue #55 contract work, follow [Demo CE's module-override instructions](demo-ce/README.md#evaluation-response-and-local-contract-development).
Standalone Go builds await a published CFN module version containing the new
response; Template CE carries its own regenerated bindings.

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

`.github/workflows/ci.yaml` tests and builds `demo-ce`. The Python `template-ce/` template is tested locally
and is not built or published by CI. When you add a deployed CE, add its unit-test and Docker build jobs
and list them in `needs` of `reusable-workflow-ci-status`, the required status job.

| CE | Jobs | Notes |
|---|---|---|
| `demo-ce` (Go) | `demo-ce-unit-tests`, `demo-ce-docker-build-push` | Needs a short-lived token for the private `cisco-eti/ioc-scale-cfn-svc` module, issued through Vault by `.github/actions/cfn-token` (vars `KEEPER_URL`, `VAULT_NAMESPACE`, `VAULT_SECRET_PATH`; secrets `VAULT_APPROLE_ROLE_ID`, `VAULT_APPROLE_SECRET_ID`); images are published from `main` only |

CI automatically runs on:
- **Pull Requests** - Unit tests + Docker build validation (no push)
- **Main branch** - Build + push `:latest` + `:YYYY-MM-DD-<sha>`
- **Manual runs** - Unit tests + Docker build validation (no push)

Tag pushes do not trigger this workflow.

### Docker Images

Images are published to GitHub Container Registry:

```
ghcr.io/cisco-eti/ioc-scale-cf-demo-ce/demo-ce:latest
ghcr.io/cisco-eti/ioc-scale-cf-demo-ce/demo-ce:YYYY-MM-DD-<sha>
```

## Contributing

1. Create your engine in `<name>/`
2. Implement the `ioc.ce.v1.CognitionEngine` contract:
   - Python (see `template-ce/`): proto definitions in `<name>/proto/`, service in `<name>/src/`, tests in `<name>/tests/`
   - Go (see `demo-ce/`): the contract comes from the `ioc-scale-cfn-svc` Go module; `cmd/`, `internal/` and `pkg/`, with the tests next to the code
3. Add it to `docker-compose.yml`
4. Add its jobs to `.github/workflows/ci.yaml` and to `needs` of `reusable-workflow-ci-status`
5. Document it in your engine's `README.md`
6. Test locally
7. Submit PR

# ioc-scale-cfn-svc

**Cognition Fabric Node (CFN)** — the central orchestration plane for Cognition Fabric.

Part of the **Cognition Fabric for Scaling** area within the **Internet of Cognition (IoC)** BHAG.

## What is CF?

Multi-agent systems generate rich cognitive signals — traces, trajectories, findings — but need
a fabric to route those signals to Cognition Engines (CEs) that act on them. CF is that fabric.

CF provides:

- **Two-tier API surface** — Active (MAS engagement) and Enforcing (block/modify/inject). Analytics APIs and the Cognition Store are owned by OXP.
- **CE routing and chaining** — compose and sequence Cognition Engines across the fabric
- **OXP integration** — trajectories and cognitive enrichment as first-class fabric signals

## Architecture

![CF High Level Architecture](docs/assets/CF_high_level_architecture.png)

## Key contracts

| Contract | Direction | Purpose |
|----------|-----------|---------|
| `ioc.cf.enforcement.v1.Enforcement/GetDisposition` | Enforcement Proxy → CF | Enforcing API — dispositions (allow/block) |
| Active API | CEs → CF | Direct MAS engagement |

## Focus areas

| Area | Description |
|------|-------------|
| **OXP core integration** | Refactor CF to integrate OXP as a first-class source of cognitive signal |
| **Two-tier CF API surface** | Active and Enforcing APIs. Analytics APIs and Cognition Store are OXP-owned. |
| **CE support** | Routing and chaining of Cognition Engines across the fabric |
| **L9 interaction with MAS** | Active and enforcing modes of L9 interaction |

## Consumers

- **CASA CE** — publishes/consumes findings via OXP's Cognition Store
- **Detective Investigations CE** — CE chaining, findings access
- **GATS CEs** — Enforcing tier dispositions
- **Security Detections CE** — queries OXP's Analytics APIs directly
- **Enforcement Proxy** — executes enforcement in-path via `ioc.cf.enforcement.v1`

## Documentation

| Document | Description |
|----------|-------------|
| [`docs/charter.md`](docs/charter.md) | Project charter — problem, scope, goals |
| [`docs/architecture.md`](docs/architecture.md) | Architecture of record |
| [`docs/dependencies.md`](docs/dependencies.md) | Project dependencies and relationships |
| [`docs/glossary.md`](docs/glossary.md) | Term definitions |
| [`docs/decisions/`](docs/decisions/) | Curated Architecture Decision Records (ADRs) |
| [`docs/target-architecture.md`](docs/target-architecture.md) | Longer-term target architecture |
| [`docs/agent-ledger/`](docs/agent-ledger/README.md) | Agent working guidance |
| [`deploy/README.md`](deploy/README.md) | Local CF source workflow and cross-repository checks |
| [`docs/specs/`](docs/specs/) | Behavioral specifications |

## Development

### Prerequisites

- Go 1.25+
- Docker (for building images and local integration tests)
- [Task](https://taskfile.dev/) (for local integration tests)
- [swag](https://github.com/swaggo/swag) (for API docs generation)
- [protoc 35.1](https://github.com/protocolbuffers/protobuf/releases/tag/v35.1) (for regenerating gRPC code)

### Setup

```bash
# Clone the repo
git clone git@github.com:cisco-eti/ioc-scale-cfn-svc.git
cd ioc-scale-cfn-svc

# Install dependencies
go mod download

# Install swag for API docs
go install github.com/swaggo/swag/cmd/swag@latest
```

### Make Commands

| Command | Description |
|---------|-------------|
| `make test` | Run unit tests with coverage |
| `task test:integration` | Run process-level integration tests (starts throwaway Postgres; requires Docker) |
| `make lint` | Check code formatting and run `go vet` |
| `make fmt` | Auto-fix code formatting |
| `make docs` | Generate OpenAPI docs from code annotations |
| `make docs-check` | Verify API docs are up-to-date |
| `make proto` | Generate CE/Enforcement Go bindings and local NOA Enforcement Python bindings |
| `make proto-check` | Verify gRPC code is up-to-date |
| `make build` | Build Docker image |
| `make run` | Run service locally |
| `make clean` | Remove Docker image |

`task test:integration` does not call `task infra:up`. Locally it starts a throwaway Postgres 17 container on `127.0.0.1:55432` via `test/integration/compose.yaml`. GitHub Actions supplies Postgres as a job service and sets `INTEGRATION_SKIP_DB=true`. Management, CEs, and the Enforcement Proxy are mocked by the suite. `make test` and `task test` do not run this suite (`//go:build integration`).

### Running Locally

```bash
# Copy the sample env file and edit as needed
cp .env.sample .env

# Edit .env with your configuration
# vim .env

# Run the service (automatically loads .env)
make run
```

### Environment Variables

The service loads environment variables from a `.env` file if present. See [`.env.sample`](.env.sample) for running CFN alone. For the full local CF stack, follow the [local workflow](deploy/README.md) and create `.env` from this repository's [`.env.example`](.env.example).

| Variable | Description | Default |
|----------|-------------|---------|
| `MGMT_URL` | Management plane base URL | `http://localhost:9000` |
| `CFN_NAME` | Name for this CFN instance | `cfn-local` |
| `CFN_IP` | Advertised IP address (auto-detected if not set) | (auto) |
| `APP_PORT` | HTTP server port | `9002` |
| `GRPC_PORT` | gRPC server port (Enforcement API) | `9003` |
| `HEARTBEAT_INTERVAL_SECONDS` | Interval of CFN's own heartbeat to the mgmt plane (not CE health) | `10` |
| `CE_PROBE_TIMEOUT_SECONDS` | Timeout (seconds, max 10) for the health probe CFN performs against a CE `health_url`, read once at startup | `1` |

### Project Structure

```
api/proto/         # Protocol Buffer definitions
cmd/cfn/           # Application entrypoint
pkg/
  api/enforcement/ # Generated gRPC code for Enforcement API
  app/             # HTTP and gRPC handlers, application logic
    httpapi/       # HTTP request/response DTOs
  client/
    casa/          # CASA CE HTTP client
    http/          # Generic HTTP client with retries
  tools/
    easyhttp/      # HTTP router and helpers
    logger/        # Structured logging (zap)
docs/api/          # Generated OpenAPI specification
```

### Adding New HTTP Endpoints

1. Add DTOs in `pkg/app/httpapi/<feature>/dto.go` with Swagger annotations
2. Add handler in `pkg/app/handlers_<feature>.go` with Swagger annotations
3. Register route in `pkg/app/app.go` `initializeRoutes()`
4. Run `make docs` to regenerate API docs
5. Add tests in `pkg/app/handlers_<feature>_test.go`

### gRPC Enforcement API

The CFN exposes a gRPC Enforcement API on port 9003 (configurable via `GRPC_PORT`).

**Proto definition:** `api/proto/enforcement/v1/enforcement.proto`

**Service:** `ioc.cf.enforcement.v1.Enforcement`

| Method | Description |
|--------|-------------|
| `GetDisposition` | Returns disposition (allow/block) for an L9 interaction |
| `AppendAuditRecord` | Commits a finalized Proxy audit record with an idempotent receipt |

See the [Proxy audit contract](docs/specs/proxy-audit-ingestion.md) for record
variants, size limits, error/receipt semantics, common outcome filtering and rollout.

**Testing with grpcurl:**

```bash
# Install grpcurl if needed
brew install grpcurl

# Call the GetDisposition endpoint
grpcurl -plaintext -d '{
  "payload": {
    "mas_id": "your-mas-uuid",
    "source_agent_id": "agent-1",
    "destination_agent_id": "agent-2",
    "trace_id": "trace-123",
    "span_id": "span-456"
  }
}' localhost:9003 ioc.cf.enforcement.v1.Enforcement/GetDisposition
```

**Regenerating gRPC code:**

Use protoc **35.1**, protoc-gen-go **v1.36.12** and protoc-gen-go-grpc **v1.6.2**
to reproduce the checked-in CE and Enforcement bindings, including the local NOA
Python client. Download protoc for your platform from the
[35.1 release](https://github.com/protocolbuffers/protobuf/releases/tag/v35.1)
and add its `bin` directory to PATH. Other versions can produce different generated
headers and fail the freshness check without a contract change.

```bash
# Install protoc plugins (one-time setup)
go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.12
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.6.2
export PATH="$(go env GOPATH)/bin:$PATH"

# Confirm the compiler, generate code, then check freshness
protoc --version # libprotoc 35.1
make proto
make proto-check
```

If the sibling Template CE is set up with its locked virtual environment, its
compiler can be selected instead. Run these commands from this CFN repository:

```bash
make PROTOC='../ioc-scale-cf-demo-ce/template-ce/.venv/bin/python -m grpc_tools.protoc' proto
make PROTOC='../ioc-scale-cf-demo-ce/template-ce/.venv/bin/python -m grpc_tools.protoc' proto-check
```

`proto-check` compares the generated `.pb.go` file list and contents against the
working tree without rewriting files. It also checks the local NOA proto copy
against the canonical Enforcement contract and checks its generated Python file.
CI runs these checks with the pinned tools before building or publishing an image.

### Code Style

- Run `make fmt` before committing to fix formatting
- Run `make lint` to check for issues
- CI will fail if code is not properly formatted

## Team

**T3:** CF — Darren Lau (Lead), Chidumga Izuzu, Samuel Yang, Shridhar Shah

See [`docs/team-assignments.md`](docs/team-assignments.md) for full roster.

## License

This project is licensed under the Apache License, Version 2.0 - see the [LICENSE.md](LICENSE.md) file for full details.

Copyright (c) 2026 Cisco Systems, Inc. and its affiliates. All rights reserved.

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at:

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

## Third-Party Notices

This project uses third-party open source components. See [THIRD-PARTY-NOTICES](THIRD-PARTY-NOTICES) for copyright and license information.

# ioc-scale-cfn-svc

**Cognition Fabric Node (CFN)** — the central orchestration plane for Cognition Fabric.

Part of the **Cognition Fabric for Scaling** area within the **Internet of Cognition (IoC)** BHAG.

## What is CF?

Multi-agent systems generate rich cognitive signals — traces, trajectories, findings — but need
a fabric to route those signals to Cognition Engines (CEs) that act on them. CF is that fabric.

CF provides:

- **Cognition Store** — shared CE memory layer for publishing and consuming findings
- **Three-tier API surface** — Analytics (read-only), Active (MAS engagement), Enforcing (block/modify/inject)
- **CE routing and chaining** — compose and sequence Cognition Engines across the fabric
- **OXP integration** — trajectories and cognitive enrichment as first-class fabric signals

## Architecture

![CF High Level Architecture](docs/assets/CF_high_level_architecture.png)

## Key contracts

| Contract | Direction | Purpose |
|----------|-----------|---------|
| `ioc.ce.v1` | CF → Enforcement Proxy | Enforcement contract — dispositions (block/modify/inject) |
| `ioc.cf.tracing.v1` | CF → Enforcement Proxy | Tracing contract — correlated traces into CF |
| Analytics API | CEs → CF | Read-only observability queries |
| Active API | CEs → CF | Direct MAS engagement |
| Enforcing API | CEs → CF | Issue dispositions via Enforcement Proxy |

## Focus areas

| Area | Description |
|------|-------------|
| **OXP core integration** | Refactor CF to integrate OXP as a first-class source of cognitive signal |
| **Cognition Store** | Build the store as required by COGS and GATS CEs |
| **Three-tier CF API surface** | Analytics, Active, and Enforcing APIs |
| **CE support** | Routing and chaining of Cognition Engines across the fabric |
| **L9 interaction with MAS** | Passive, active, and enforcing modes of L9 interaction |

## Consumers

- **CASA CE** — publishes/consumes findings via Cognition Store
- **Detective Investigations CE** — CE chaining, findings access
- **GATS CEs** — Enforcing tier dispositions
- **Security Detections CE** — Analytics tier queries
- **Enforcement Proxy** — executes enforcement in-path via `ioc.ce.v1`

## Documentation

| Document | Description |
|----------|-------------|
| [`docs/charter.md`](docs/charter.md) | Project charter — problem, scope, goals |
| [`docs/architecture.md`](docs/architecture.md) | Architecture of record |
| [`docs/dependencies.md`](docs/dependencies.md) | Project dependencies and relationships |
| [`docs/glossary.md`](docs/glossary.md) | Term definitions |
| [`docs/decisions/`](docs/decisions/) | Architecture Decision Records (ADRs) |
| [`docs/specs/`](docs/specs/) | Behavioral specifications |

## Development

### Prerequisites

- Go 1.23+
- Docker (for building images)
- [swag](https://github.com/swaggo/swag) (for API docs generation)

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
| `make lint` | Check code formatting and run `go vet` |
| `make fmt` | Auto-fix code formatting |
| `make docs` | Generate OpenAPI docs from code annotations |
| `make docs-check` | Verify API docs are up-to-date |
| `make build` | Build Docker image |
| `make run` | Run service locally |
| `make clean` | Remove Docker image |

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

The service loads environment variables from a `.env` file if present. See [`.env.sample`](.env.sample) for a template.

| Variable | Description | Default |
|----------|-------------|---------|
| `MGMT_URL` | Management plane base URL | `http://localhost:9000` |
| `CFN_NAME` | Name for this CFN instance | `cfn-local` |
| `CFN_IP` | Advertised IP address (auto-detected if not set) | (auto) |
| `APP_PORT` | HTTP server port | `9001` |
| `HEARTBEAT_INTERVAL_SECONDS` | Interval between heartbeats to mgmt plane | `29` |

### Project Structure

```
cmd/cfn/           # Application entrypoint
pkg/
  app/             # HTTP handlers and application logic
    httpapi/       # Request/response DTOs
  client/http/     # HTTP client with retries
  tools/
    easyhttp/      # HTTP router and helpers
    logger/        # Structured logging (zap)
docs/api/          # Generated OpenAPI specification
```

### Adding New Endpoints

1. Add DTOs in `pkg/app/httpapi/<feature>/dto.go` with Swagger annotations
2. Add handler in `pkg/app/handlers_<feature>.go` with Swagger annotations
3. Register route in `pkg/app/app.go` `initializeRoutes()`
4. Run `make docs` to regenerate API docs
5. Add tests in `pkg/app/handlers_<feature>_test.go`

### Code Style

- Run `make fmt` before committing to fix formatting
- Run `make lint` to check for issues
- CI will fail if code is not properly formatted

## Team

**T3:** CF — Darren Lau (Lead), Chidumga Izuzu, Samuel Yang, Shridhar Shah

See [`docs/team-assignments.md`](docs/team-assignments.md) for full roster.

# ioc-scale-cfn-svc

Cognition Fabric Node (CFN) — the central orchestration plane for Cognition Fabric.

CFN is a microservice that:
- Routes tasks to Cognitive Engines based on subprotocols
- Ingests metrics and audit events
- Manages shared memory
- Handles registration/heartbeat lifecycle for CEs

## Documentation

Project documentation follows the TOME template:

- [`docs/README.md`](docs/README.md) — documentation index
- [`docs/charter.md`](docs/charter.md) — project charter (start here)
- [`docs/architecture.md`](docs/architecture.md) — architecture of record
- [`docs/decisions/`](docs/decisions/) — Architecture Decision Records (ADRs)
- [`docs/specs/`](docs/specs/) — behavioral specifications
- [`docs/glossary.md`](docs/glossary.md) — term definitions

## Project Structure

```
.
├── cmd/                    # Application entrypoints
├── pkg/                    # Library code
├── docs/                   # Project documentation (TOME template)
│   ├── decisions/          # Architecture Decision Records
│   └── specs/              # Behavioral specifications
├── build/                  # CI build artifacts
├── deploy/                 # Deployment configurations
└── .github/                # GitHub configs and hooks
```

## Development

### Prerequisites

- Go 1.21+

### Install git hooks

```bash
ln -s $(pwd)/.github/githooks/pre-commit .git/hooks/pre-commit
```

## Style Guide

Please refer to this style guide to keep code clean, readable, and consistent:
https://google.github.io/styleguide/go/best-practices

## Effective Go

- https://go.dev/doc/effective_go
- https://go-proverbs.github.io
- https://dave.cheney.net/2020/02/23/the-zen-of-go

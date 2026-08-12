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

- Go 1.24+

### Setup

```bash
# Clone the repo
git clone git@github.com:cisco-eti/ioc-scale-cfn-svc.git
cd ioc-scale-cfn-svc

# Install git hooks
ln -s $(pwd)/.github/githooks/pre-commit .git/hooks/pre-commit
```

## Team

**T3:** CF — Darren Lau (Lead), Chidumga Izuzu, Samuel Yang, Shridhar Shah

See [`docs/team-assignments.md`](docs/team-assignments.md) for full roster.

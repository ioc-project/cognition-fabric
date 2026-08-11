# Dependencies

**Category:** source + generated

> Project-level dependency edges. Upstream dependencies are services we consume;
> downstream dependencies are services that consume us.

## Upstream dependencies

| Service | Purpose | Contract |
|---------|---------|----------|
| `ioc-knowledge-memory-svc` | Knowledge graph + vector store | HTTP REST |
| `ioc-cfn-cognitive-agents` | Cognitive agents (evidence, ingestion, negotiation) | HTTP REST |
| `ioc-cfn-mgmt-backend-svc` | Management/admin backend | HTTP REST |

## Downstream dependencies

| Consumer | Purpose | Contract |
|----------|---------|----------|
| Multi-Agent Systems (MAS) | Primary consumers of CFN capabilities | HTTP REST |

## External dependencies

| Dependency | Purpose | Version |
|------------|---------|---------|
| *TODO* | *TODO* | *TODO* |

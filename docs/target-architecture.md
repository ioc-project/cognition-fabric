# Longer-term target architecture

This document describes the broader CF target and planned API surface. For the Releases 1–3 architecture and current integration boundaries, see [architecture.md](architecture.md).

<!-- kind: source · source of truth: GitHub (this file) -->

This describes a longer-term Cognition Fabric (CF) target and does not define the current Releases 1–3 deployment.

## High-level architecture

![CF High Level Architecture](assets/CF_high_level_architecture.png)

This historical concept diagram uses older API labels. CF owns two API tiers:
Active (planned) and Enforcing. Analytics APIs and the Cognition Store are
currently owned by OXP; CEs access OXP directly.

## Components

### 1. OXP + Cognition Store (OXP-owned)

The data layer, currently owned by OXP, providing:
- **Temporal KG** — temporal knowledge graph
- **Latent space** — vector embeddings
- **Symbolic space** — symbolic representations
- **KV** — key-value storage
- **Cognition** — cognitive state

Fed by **Observability/OXP** through realtime ingestion, with **Otel Telemetry** as an upstream source.

### 2. CF APIs (Active, Enforcing) and OXP Analytics APIs

CF owns two API tiers:

| Tier | APIs | Purpose |
|------|------|---------|
| **Active** | Active Cognition Fabric APIs (planned) | Direct MAS engagement — CEs send messages, query tools |
| **Enforcing** | Enforcing Cognition Fabric APIs | Enforcement decisions; content modification and injection remain target capabilities |

Analytics APIs are owned and served directly by OXP. CEs query OXP for traces,
trajectories, metrics and Cognition Store findings.

The diagram shows:
- **Active Cognition Fabric APIs** (labelled Interactive in the historical diagram) receiving messages to/from MAS and tool calling
- **Enforcing Cognition Fabric APIs** handling L9 messages/tool calls with disposition
- **OXP Analytics APIs** providing read access to the OXP-owned Cognition Store

### 3. CF CE Support

Cognition Engines connect to the APIs:
- **COGS CE1, CE2, CE3** — planned consumers of Active APIs
- **GAT CE 4, GAT CE 5** — connected to Enforcing APIs

### 4. CF Mgmt. Plane + mgmt. APIs + configuration & settings db.

The **CF Management service** provides:
- UI
- Mgmt Plane
- Config DB

### 5. CF Audit

**Audit service** for compliance and observability.

### 6. CFN + CE routing/chaining

The **Cognition Fabric Node (CFN)** handles:
- CE Routing
- CE Chaining

## Data flow

### MAS to CF

1. **Agent / SLIM point** — MAS agents connect via SLIM or direct agent protocols
2. **Enforcement Point** — in-path enforcement via the Enforcement Proxy
3. Planned Active APIs support direct MAS engagement; Enforcing APIs support enforcement decisions

### CE to OXP and Cognition Store

1. CEs publish and query findings through the OXP-owned Cognition Store interfaces
2. OXP owns trace ingestion, trajectory reconstruction and Analytics APIs
3. Otel Telemetry feeds into Observability/OXP; CF does not proxy Analytics reads

Notification requirements remain subject to the OXP/CE contract.

### CE interactions

1. COGS CEs are planned consumers of Active APIs for direct MAS engagement
2. GAT CEs connect to Enforcing APIs to issue dispositions
3. CEs query OXP's Analytics APIs directly for read-only access

## Key contracts

| Contract | From | To | Protocol | Purpose | Status |
|----------|------|-----|----------|---------|--------|
| `ioc.cf.enforcement.v1` | CF | Enforcement Proxy | gRPC/Proto | Enforcement contract — dispositions (`allow`/`block`/`modify`) | [Under discussion](discussions/0001-enforcement-api-contract.md) |
| `ioc.cf.tracing.v1` | CF | Enforcement Proxy | TBD | Tracing contract — correlated traces | Not started |
| L9 message schema | L9 T3 | CF | — | Message and interaction semantics | Dependent on L9 T3 |

## Deployment

CF deploys as a set of microservices:
- **CF Management service** — management plane, UI, config
- **Cognition Fabric Node** — API gateway, CE routing
- **Audit service** — compliance logging

The Cognition Store and Analytics APIs are external OXP-owned dependencies.

## Related documents

- [Charter](charter.md) — problem statement, scope, goals
- [Dependencies](dependencies.md) — project-level relationships
- [Decisions](decisions/README.md) — Architecture Decision Records
- [Specs](specs/README.md) — detailed specifications

# Architecture

<!-- kind: source · source of truth: GitHub (this file) -->

The architecture of record for Cognition Fabric (CF).

## High-level architecture

![CF High Level Architecture](assets/CF_high_level_architecture.png)

The diagram includes target capabilities: Active APIs and CE chaining are planned.
The current enforcing path routes reference identifiers and metadata to one eligible
CASA CE; it does not carry rewritten content or inject messages.

## Components

### 1. OXP + Cognition Store (OXP-owned)

The data layer (owned by OXP) providing:
- **Temporal KG** — temporal knowledge graph
- **Latent space** — vector embeddings
- **Symbolic space** — symbolic representations
- **KV** — key-value storage
- **Cognition** — cognitive state

Fed by **Observability/OXP** through realtime ingestion, with **Otel Telemetry** as an upstream source.

### 2. CF APIs (Active, Enforcing) + OXP Analytics APIs

Two-tier CF API surface, with Analytics owned by OXP:

| Tier | APIs | Owner | Purpose |
|------|------|-------|---------|
| **Analytics** | Analytics APIs | OXP | Read-only observability — CEs query traces, trajectories, metrics directly from OXP |
| **Active** | Active Cognition Fabric APIs | CF | Direct MAS engagement — CEs send messages, query tools |
| **Enforcing** | Enforcing Cognition Fabric APIs | CF | Return allow/block decisions or a modify-requested flag to the caller |

The diagram shows:
- **Active Cognition Fabric APIs** receiving messages to/from MAS and tool calling
- **Enforcing Cognition Fabric APIs** handling L9 messages/tool calls with disposition
- **Analytics APIs (OXP-owned)** providing read access to the Cognition Store

### 3. CF CE Support

The diagram's CE labels represent these roles:
- **COGS CE1, CE2, CE3** — planned consumers of Active APIs
- **GAT CE 4, GAT CE 5** — enforcing roles; current CFN calls associated CEs
  registered as `ce_type=CASA`
- CEs needing read-only observability connect directly to OXP's Analytics APIs

### 4. CF Mgmt. Plane + mgmt. APIs + configuration & settings db.

The **CF Management service** provides:
- Workspace, MAS and CE inventory and assignments
- Stored configuration and versioned CFN config snapshots
- CE health monitoring through CFN; CFN heartbeat status

The separate **CF UI** calls Management APIs to manage resources and read audits.

### 5. CF Audit

CFN stores its disposition audits asynchronously on a best-effort basis. Proxy
records use the separate `AppendAuditRecord` RPC, which persists before acknowledging.
Management exposes audit list/detail reads, and the UI displays the stored records.
See the [audit contracts](../api/enforcement/docs/proxy-audit-ingestion.md).

### 6. CFN + CE routing/chaining

The **Cognition Fabric Node (CFN)** handles:
- Routing to the first associated, enabled, online CASA CE with an enforcing address
- CE registration, health probes, MAS discovery and lifecycle notifications
- CE chaining is planned

## Data flow

### MAS to CF

1. The Enforcement Proxy (or a direct-enforcement runtime) calls `GetDisposition`
   with MAS, source/destination agent, trace and span IDs plus optional metadata.
2. CFN resolves the assigned workspace, fetches current MAS/CE state from Management,
   and calls one eligible CASA CE's `Evaluate` with those references and metadata.
3. CFN maps the CE outcome to an action. The caller applies it; the response contains
   no replacement content. See the [current enforcement flow](discussions/0001-enforcement-api-contract.md#current-enforcement-flow).

### CE to Cognition Store

CEs query OXP and its Cognition Store directly for evidence. Trace ingestion,
trajectory reconstruction and CE findings are OXP/CE responsibilities; CFN does not
assemble that context or proxy Analytics reads.

### CE interactions

1. Active APIs for direct MAS engagement are planned
2. CFN calls the selected CE to obtain a disposition
3. All CEs can query OXP's Analytics APIs directly for read-only access

For lifecycle state, Management asks CFN to probe CEs, while CFN heartbeats Management
and pulls newer config versions. MAS changes in those snapshots trigger notifications
to associated CE callbacks; CEs can then pull current MAS metadata. See
[CE lifecycle](../api/ce/docs/CE-LIFECYCLE.md) and [MAS notifications](discussions/0003-mas-lifecycle-notifications.md).

## Key contracts

| Contract | From | To | Protocol | Purpose | Status |
|----------|------|-----|----------|---------|--------|
| `ioc.cf.enforcement.v1.Enforcement/GetDisposition` | Enforcement Proxy or direct runtime | CFN | gRPC | Allow/block or modify-requested; no rewritten content | [Implemented](discussions/0001-enforcement-api-contract.md) |
| `ioc.ce.v1.CognitionEngine/Evaluate` | CFN | CE | gRPC | References and metadata in; outcome, reason and optional details out | [Implemented](../api/ce/docs/ce-evaluation-response.md) |
| `ioc.cf.enforcement.v1.Enforcement/AppendAuditRecord` | Enforcement Proxy | CFN | gRPC | Persist a finalized Proxy record with an idempotent receipt | [Implemented](../api/enforcement/docs/proxy-audit-ingestion.md) |
| `ioc.cf.tracing.v1` | Enforcement Proxy | CF | TBD | Tracing contract — correlated traces | Not started |
| L9 message schema | L9 T3 | CF | — | Message and interaction semantics | Dependent on L9 T3 |

## Deployment

CF deploys as a set of microservices:
- **CF Management service** — management plane and config
- **CF UI** — management interface and audit display
- **Cognition Fabric Node** — API gateway, CE routing
- **PostgreSQL** — Management configuration and CFN audit storage

OXP/Cognition Store, the Enforcement Proxy and CEs are external integrations.

## Related documents

- [Charter](charter.md) — problem statement, scope, goals
- [Dependencies](dependencies.md) — project-level relationships
- [Decisions](decisions/README.md) — Architecture Decision Records
- [Specs](specs/README.md) — detailed specifications

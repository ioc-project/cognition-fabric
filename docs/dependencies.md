# Dependencies

<!-- kind: source+generated · source of truth: this file for project edges; Beads for roadmap/issue edges -->

What this T3 depends on, what depends on it, and where each relationship stands.

This file owns **project-level** relationships: T3-to-T3, T3-to-Area, T3-to-BHAG, and named
consumer dependencies. Roadmap and feature dependency graphs live in Beads and should be generated
from `.beads/issues.jsonl`; do not duplicate them by hand here.

## Relationship taxonomy

Every edge below uses one of these relations:

| Relation | Meaning |
|---|---|
| `blocks` | A cannot progress until B is done |
| `depends on` | A needs B's output or contract, but can progress in parallel on stubs |
| `supersedes` | A replaces B; B is retired |
| `duplicates` | A and B describe the same work |
| `contradicts` | A and B make incompatible claims; one must give |
| `relates to` | A and B share context but neither gates the other |
| `part of` | A is a component of B (T3 → Area → BHAG) |

## Dependency graph

```mermaid
flowchart LR
  classDef ours fill:#02C8FF,stroke:#333,color:#000
  classDef peer fill:#D6D6D6,stroke:#333,color:#000
  classDef consumer fill:#FF9000,stroke:#333,color:#000
  classDef external fill:#FFFFFF,stroke:#333,stroke-dasharray: 4 3,color:#000

  CF["CF T3"]:::ours

  L9["L9 T3<br/>message semantics"]:::peer
  EP["Enforcement Proxy T3<br/>in-path enforcement"]:::peer
  OXP["OXP T3<br/>cognitive observability"]:::peer
  LAB["MAS-Lab / Mycelium<br/>validation envs"]:::peer

  CASA["CASA CE"]:::consumer
  DET["Detective Investigations<br/>CE"]:::consumer
  SEC["Security Detections CE"]:::consumer
  GATS["GATS CEs"]:::consumer

  AREA["Area: Cognition Fabric for Scaling"]
  BHAG["BHAG: Internet of Cognition"]

  L9 -->|depends on: L9 message schema| CF
  OXP -->|depends on: trace & trajectory ingestion| CF
  EP -->|depends on: Enforcement contract ioc.cf.enforcement.v1| CF
  EP -->|depends on: Tracing contract ioc.cf.tracing.v1| CF
  LAB -->|relates to: validation target| CF

  CF -->|blocks: Cognition Store| CASA
  CF -->|blocks: Cognition Store| DET
  CF -->|blocks: Enforcing API| GATS
  CF -->|relates to: Analytics tier| SEC

  CF -->|part of| AREA
  AREA -->|part of| BHAG
```

Read the arrows as *"the tail is needed by / affects the head."* The `blocks` edges out of CF
are the reason this T3 is on the critical path: **CASA, Detective, and GATS CEs cannot publish
or consume findings until the Cognition Store is live, and GATS cannot enforce until the
Enforcing API contract is specified.**

**The Enforcement Proxy is our primary enforcement counterparty.** CF specifies the Enforcement
contract (`ioc.cf.enforcement.v1`) and Tracing contract (`ioc.cf.tracing.v1`); the Enforcement Proxy
executes enforcement in-path.

## Project-level dependencies

| # | Relation | Owner (their side) | Owner (ours) | Target date | Progress |
|---|---|---|---|---|---|
| P1 | **CF `depends on` L9** for message and interaction semantics | L9 main protocol & CEs T3 | TBD | Ongoing | **At risk** — L9 schema still evolving; CF mediates without owning it |
| P2 | **CF `depends on` OXP** for **trajectories and cognitive enrichment** — OXP is the primary source of traces and reconstructed trajectories | OXP T3 | TBD | TBD | **Not started** — integration design not yet captured |
| P3 | **Enforcement Proxy `depends on` CF** for the **Enforcement contract** `ioc.cf.enforcement.v1` — CF specifies, Proxy executes | Enforcement Proxy T3 | TBD | TBD | **Not started** — contract specification in progress |
| P4 | **Enforcement Proxy `depends on` CF** for the **Tracing contract** `ioc.cf.tracing.v1` | Enforcement Proxy T3 | TBD | TBD | **Not started** — contract not yet written |
| P5 | **CASA `blocks on` CF** — needs the Cognition Store to publish and consume findings | CASA CE T3 | TBD | TBD | **Not started** |
| P6 | **Detective Investigations `blocks on` CF** — needs the Cognition Store for CE chaining | Detective Active Investigations CE T3 | TBD | TBD | **Not started** |
| P7 | **GATS CEs `blocks on` CF** — needs the Enforcing API to issue dispositions | GATS CEs T3 | TBD | TBD | **Not started** |
| P8 | **Security Detections `relates to` CF** — consumes the Analytics tier only, so it is not gated on us | Security Detections CE T3 | TBD | — | **Not started** |
| P9 | **CF `relates to` MAS-Lab and Mycelium** as validation environments | MAS-Lab T3 / Mycelium T3 | TBD | — | **Open** — target environment undecided |
| P10 | **CF `part of` Cognition Fabric for Scaling**, which is `part of` the IoC BHAG | Area Context Leads | Darren Lau | — | **Done** — positioning settled in charter |

## Upstream dependencies

| Service | Purpose | Contract |
|---------|---------|----------|
| `OXP` | Traces, trajectories, cognitive enrichment | TBD |
| `L9` | Message and interaction semantics | L9 protocol |
| `ioc-cfn-cognitive-agents` | Cognitive agents (evidence, ingestion, negotiation) | HTTP REST |
| `ioc-cfn-mgmt-backend-svc` | Management/admin backend | HTTP REST |

## Downstream dependencies

| Consumer | Purpose | Contract |
|----------|---------|----------|
| `Enforcement Proxy` | In-path enforcement execution | `ioc.cf.enforcement.v1`, `ioc.cf.tracing.v1` |
| Multi-Agent Systems (MAS) | Primary consumers of CFN capabilities | HTTP REST (three-tier API) |
| CASA CE | Publish/consume findings via Cognition Store | CF APIs |
| Detective Investigations CE | CE chaining, findings access | CF APIs |
| GATS CEs | Enforcing tier dispositions | Enforcing API |
| Security Detections CE | Analytics tier queries | Analytics API |

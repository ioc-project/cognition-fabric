# Glossary

<!-- kind: source · source of truth: GitHub (this file) -->

Terms a new teammate on **this** project needs. **One `##` heading per term** — TOME maps each
heading to its own `glossary/<slug>.md` wiki entry, so the structure matters. Acronyms carry their
expansion on the first line. Terms still under discussion link to
[`discussions/README.md`](discussions/README.md).

---

## CFN

The central orchestration plane for Cognition Fabric. CFN is a microservice that routes enforcement evaluations to an eligible CE, ingests audit events, and handles registration and health probing for CEs.

## Cognition Fabric

The management plane and node runtime that connect Multi-Agent Systems to Cognition
Engines for governance and enforcement. Shared findings and Analytics APIs are
provided directly by OXP.

## CF API Tiers

CF owns two API tiers: **Enforcing** for runtime enforcement decisions and **Active**
for planned direct MAS engagement. Analytics APIs are owned and served by OXP and
are outside the CF API surface. CEs query OXP directly for observability data and
Cognition Store findings.

## Cognition Store

The shared findings store currently owned by OXP. CEs publish their results and
consume other CEs' findings through OXP interfaces. CF does not own or proxy this
store. Notification requirements are subject to the OXP/CE contract.

## MAS

Multi-Agent System — a collection of autonomous agents that collaborate to accomplish tasks.
MAS communicates with the Cognition Fabric through the CFN.

## Workspace

A logical container that scopes resources and access within the IOC platform. Used alongside
`mas_id` for tenant isolation.

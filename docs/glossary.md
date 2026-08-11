# Glossary

<!-- kind: source · source of truth: GitHub (this file) -->

Terms a new teammate on **this** project needs. **One `##` heading per term** — TOME maps each
heading to its own `glossary/<slug>.md` wiki entry, so the structure matters. Acronyms carry their
expansion on the first line. Terms still under discussion link to
[`discussions.md`](discussions.md).

---

## CFN

The central orchestration plane for Cognition Fabric. CFN is a microservice that routes tasks to Cognitive Engines based on subprotocols, ingests metrics and audit events, manages shared memory, and handles registration/heartbeat lifecycle for CEs.

## Cognition Fabric

The interconnected network of services that provide memory, knowledge, and cognitive
capabilities to Multi-Agent Systems.

## MAS

Multi-Agent System — a collection of autonomous agents that collaborate to accomplish tasks.
MAS communicates with the Cognition Fabric through the CFN.

## Workspace

A logical container that scopes resources and access within the IOC platform. Used alongside
`mas_id` for tenant isolation.

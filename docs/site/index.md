# Cognition Fabric

Cognition Fabric (CF) connects multi-agent systems (MAS) to Cognition Engines
(CEs) for governance and enforcement. When the Enforcement Proxy intercepts a
configured interaction, CF asks a CE for a decision and records the evaluation
for review.

This site describes the current Cognition Fabric implementation. The broader
[Internet of Cognition architecture](https://ioc-project.github.io/overview/architecture/) describes
the target across the IoC projects.

## How Cognition Fabric works

![Cognition Fabric components and API connections](assets/cf-architecture-context.svg)

| Component | Responsibility |
| --- | --- |
| CF Management | Manages workspaces, MAS declarations, CFN and CE registrations, and their associations. |
| CF UI | Provides onboarding, administration, and audit inspection. |
| Cognition Fabric Node (CFN) | Routes enforcement requests to an eligible CE, probes CE health, and delivers MAS lifecycle notifications. |
| Cognition Engines | Evaluate interactions against policy or analyze evidence. The repository includes a Python Template CE and a Go Demo CE. |
| Enforcement Proxy | Runs alongside the MAS, asks CFN for a disposition, applies the decision, and submits audit evidence. |
| SCOPE | Processes MAS telemetry and provides Analytics APIs for CE evidence reads. |

The standard CF deployment runs CF Management, CF UI, CFN, and SCOPE alongside
a shared PostgreSQL server. The MAS, Enforcement Proxy, and CEs run as separate
processes and connect through their respective interfaces.

In the current implementation, SCOPE also hosts the Cognition Store API, which
lets CEs submit and retrieve findings. The store may move under CF in a later
release. See the [architecture document](https://github.com/ioc-project/cognition-fabric/blob/main/docs/architecture.md)
for component boundaries and runtime flows.

## Explore

- [Analytics](analytics.md) for reading evidence through SCOPE.
- [Active](active.md) for the planned direct MAS engagement API.
- [Enforcement](enforcement.md) for decisions on mediated interactions.
- [Getting Started](getting-started/index.md) to run CF or explore a sample CE.

# Specs

<!-- kind: source · source of truth: GitHub (this directory) -->

Specifications for the behavior of Cognition Fabric (CF). These stay high-level and
describe **what** the service must do; byte-level contracts and implementation detail arrive
with the code.

## Index

| Spec | Scope | Status |
|------|-------|--------|
| [CFN disposition audit](disposition-audit.md) | Shared producer identity and CFN disposition audit records, limits and rollout | Accepted; issue #34 implementation |
| [CE evaluation response](ce-evaluation-response.md) | Neutral decision, optional CE details, legacy binary compatibility and audit capture | Issue #55; local implementation |

## Pending

The following are under discussion and will become specs once finalized:

- [Enforcement API contract](../discussions.md#d1-enforcement-api-contract) — initial agreement with Enforcement Proxy T3

## Related

- [Discussions](../discussions.md) — open questions and in-progress API designs
- [Decisions](../decisions/README.md) — rationale behind architectural choices
- [Target architecture](../target-architecture.md) — planned three-tier API surface

# 0003 — Keep Cognition Fabric in one source repository

**Status:** Accepted
**Date:** 2026-11-13

**Follow-up:** [ADR 0004](0004-include-deployment-in-monorepo.md), accepted on
2026-11-18, supersedes only the separate-Deployment boundary below. Deployment
assets now live in `deploy/`; OXP remains external.

## Context

CFN, Management, UI and CE sources were maintained in separate repositories.
Changes to shared contracts, service behavior and development tooling required
coordinated updates. The decision is recorded in
[issue #86](https://github.com/cisco-eti/ioc-scale-cfn-svc/issues/86).

## Decision

Maintain Cognition Fabric source in `cognition-fabric`, preserving the component
Git histories. Keep shared contracts in `api/`, services in `cfn/`, `cf-mgmt/` and
`cf-ui/`, examples in `samples/`, development tooling in `dev/`, and project
documentation in `docs/`.

Components retain independent versions and folder-prefixed release tags.
Deployment and OXP remain separately maintained dependencies.

## Consequences

Cross-component changes can be reviewed and tested together. Go services consume
the shared API module within this repository. Repository layout changes do not
change service wire contracts. Component releases remain independent.

# 0004 — Include deployment assets in the CF monorepo

**Status:** Accepted
**Date:** 2026-11-18

## Context

Local CF setup needs the shared Compose stack, enforcement overlays and database
image source alongside the service source and development tooling. The decision
is recorded in [issue #75](https://github.com/cisco-eti/cognition-fabric/issues/75).

## Decision

Maintain these deployment assets in `deploy/`, preserving their source history
and provenance. Keep the database image publishing workflow in root
`.github/workflows/`, with its own manual image-tag input and existing image name.
The root `.env.example` and `.env` configure both the deployment stack and local
development tasks.

This supersedes the Deployment portion of [ADR 0003](0003-consolidate-cf-repositories.md)'s
statement that "Deployment and OXP remain separately maintained dependencies."
OXP remains external. OXP and Enforcement Proxy continue to use their existing
images and contracts. Internal ArgoCD smoke-test assets are outside this decision.

## Consequences

A clean checkout contains the deployment assets needed by the local launchers.
Compose keeps its existing project, network and volume names. Service contracts,
image references and independent component versions remain unchanged. The
database image retains its separate publishing workflow.

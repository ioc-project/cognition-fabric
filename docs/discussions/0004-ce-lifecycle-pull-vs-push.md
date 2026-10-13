# D4: CE Lifecycle, Pull vs Push Model

**Status:** Open

**Date:** 2026-10-13

**Parties:** CF Team, CE Teams

## Context

CE teams prefer a **pull-based** liveness model where CFN checks each CE, rather than each CE running a heartbeat loop (Gap 1 in [D3: Cross-Team Integration Gaps](https://grid.outshift.io/projects/cf/tome/wiki/discussions/d3-cross-team-integration-gaps.md)). The current implementation is push-based.

### Current implementation (push)

- The CE sends `PUT /api/cognition-engine/{id}/heartbeat` to CFN, which forwards it to the management plane.
- The management plane updates the CE's `last_seen` and flips `offline` to `online` (`cognition_engine.py`, `heartbeat`).
- A background monitor (`cognition_engine_monitor.py`) runs every 1s and marks a CE `offline` when `last_seen` is older than `CE_OFFLINE_THRESHOLD_SECONDS` (default 15s). Registration creates the CE as `online` without setting `last_seen`, so a CE that never sends a heartbeat is never marked `offline`.
- CFN routing only reads the CE `status` field. It selects the first CE that is `enabled` and `status == "online"` (`grpc_enforcement.go`).

## Current thinking

Replace the heartbeat with management plane probing through CFN - the same liveness mechanism in the opposite direction.

### Proposal

1. Each CE declares a **`health_url`** at registration (a full URL, for example `http://my-ce:8080/healthz`), next to `base_url` and `endpoint`.
2. Every X seconds the management plane monitor asks CFN to check each enabled CE. CFN performs one HTTP GET against the CE's `health_url`.
3. A `200` within the timeout means healthy. Anything else, or no answer, means unhealthy.
4. The management plane sets the CE `status` (`online` or `offline`) from the result.
5. CFN routing is unchanged. It still reads `status`.

The CE only needs to serve one plain route. Nothing in the contract depends on how the CE otherwise communicates, so the same mechanism applies to every CE type.

### What it replaces

The heartbeat and the probe cannot both exist, because both would write `status` and could contradict each other.

| Component        | Removed                                                                           | Kept                                       |
| ---------------- | --------------------------------------------------------------------------------- | ------------------------------------------ |
| CE               | Heartbeat loop, `CE_HEARTBEAT_INTERVAL_SEC`                                       | Registration                               |
| CFN              | Heartbeat forwarding handler (`/api/cognition-engine/{ceId}/heartbeat`)           | CE selection by `status`                   |
| Management plane | CE heartbeat endpoint, `last_seen` threshold logic (`mark_stale_engines_offline`) | `status` field, monitor loop (now probing) |

The CE `last_seen` column can stay as "last successful probe" for display, or be dropped.

### How it fits today

- **Direction.** Only CFN calls into CEs. The management plane asks CFN to probe and never contacts a CE directly.
- **Routing.** No change to CE selection, since `status` keeps its meaning.
- **Never-answering CEs.** `status` is set from the probe result and no longer depends on `last_seen`, so a CE that registers and never answers a probe is marked `offline`.

## Decisions

### D4.1: Health check mechanism

**Proposed:** CFN performs an HTTP GET on a CE-declared `health_url`. It replaces the heartbeat.

**Rationale:**

- Works for every CE regardless of how it is otherwise reached
- CE implements one route instead of a loop
- Application-level signal, stronger than a connect check

### D4.2: CEs implement the health endpoint

**Decision:** `health_url` is a required registration field and every CE must serve it. A CE without it is rejected at registration.

### D4.3: Probe behavior

**Decision:** A probe is an unauthenticated HTTP GET. A `200` within 1s means healthy, and anything else means unhealthy. The response body is ignored, so the endpoint exposes no data. The probe runs every 2s and the offline threshold is 6s (three missed probes). All values are environment variables.

## Next steps

### CE side

1. Serve a health route that returns `200` when the CE is up, for example `GET /healthz`. No auth and no required body.
2. Send `health_url` in the registration request (`POST /api/cognition-engine`) and in the `PATCH` made after a `409` on restart, so the URL follows the CE if its address changes.
3. Remove the heartbeat loop and `CE_HEARTBEAT_INTERVAL_SEC`.

### CF side

**CFN (`ioc-scale-cfn-svc`)**

1. Accept and validate `health_url` in the CE registration and PATCH requests, and forward it to the management plane (`handlers_cognition_engine.go`, `httpapi/cognitionengine/dto.go`).
2. Add an internal endpoint the management plane calls to probe a CE. It performs the GET against the given `health_url` with the 1s timeout and returns healthy or unhealthy. Place it with the existing internal management plane routes.
3. Remove the CE heartbeat handler and route (`PUT /api/cognition-engine/{ceId}/heartbeat`)

**Management plane (`ioc-scale-cf-mgmt-svc`)**

1. Add a required `health_url` column to the CE model and add it to the create, patch and response schemas.
2. Replace `mark_stale_engines_offline` in the monitor with a probe loop. Every 2s, call CFN at `CFN_SVC_URL` for each enabled, non-deleted CE and set `status` from the result. Keep `last_seen` as the last successful probe.
3. When a CE flips from `offline` to `online`, call `update_config_for_cfn` as the heartbeat endpoint does today, so CFN's config snapshot refreshes.
4. Remove the CE heartbeat endpoint, its `heartbeat` permission in `authz/operations/cognition_engine.rego`, and the related tests.
5. Add the probe interval, timeout and offline threshold environment variables.

**Docs and deployment**

1. Update `CE-LIFECYCLE.md` for the pull model.
2. Remove `CE_HEARTBEAT_INTERVAL_SEC` from the demo CE service in `ioc-scale-cf-deployment/docker-compose.yml` and add the health route setting if one is needed.

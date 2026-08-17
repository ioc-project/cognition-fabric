# D1 — Enforcement API Contract

**Status:** Updated — workspace abstraction decision

**Date:** 2026-08-17 (updated from 2026-08-11)

**Parties:** CF T3, Enforcement Proxy T3

## Context

The Enforcement Proxy needs to call CF to determine the disposition for in-flight L9 interactions.
This discussion captures the initial agreement on the API shape between the two teams.

## Current agreement

**Protocol:** gRPC/Proto (preferred over REST for consistency between teams)

**Behavior:**
- Blocking — the Enforcement Proxy blocks until CF returns a disposition
- Timeout — TBD, depends on CASA CE response time

### Request

```json
{
  "extra": "TBD (for headers/metadata)",
  "payload": {
    "mas_id": "UUID4",
    "source_agent_id": "str",
    "destination_agent_id": "str",
    "trace_id": "UUID4/str"
  }
}
```

**Notes:**
- `workspace_id` is **not** exposed to the Enforcement Proxy — CF/management-plane handles workspace resolution internally (see decision D1.1 below)
- `trace_id` — Proxy needs to observe this ID to coordinate spans; sync with Pavan

### Response

```json
{
  "action": "allow | block | modify (TBD)",
  "modify": "boolean (optional)"
}
```

**Actions:**
- `allow` — permit the interaction to proceed unchanged
- `block` — deny the interaction
- `modify` — (TBD) alter the interaction before forwarding

## Decisions

### D1.1 — Hide workspace from Enforcement Proxy

**Decision:** The `workspace_id` concept is abstracted away from the Enforcement Proxy client. The proxy only provides `mas_id`; CF/management-plane is responsible for resolving the associated workspace internally.

**Rationale:**
- `mas_id` is sufficient for tenancy requirement for now
- Simplifies the Enforcement Proxy contract — fewer concepts to understand and propagate
- Workspace is a CF/management-plane concern, not an enforcement concern

**Implication:** CF must maintain a `mas_id → workspace_id` mapping and perform the lookup on each enforcement request.

## Open questions

| Item | Status | Owner |
|------|--------|-------|
| `extra` field contents — what headers/metadata are needed? | TBD | CF + Proxy |
| Timeout value — depends on CASA CE response characteristics | TBD | CF + CASA |
| `modify` action semantics — what can be modified and how? | TBD | CF + Proxy |
| `mas_id` semantics — needs IOC-level agreement | TBD | IOC |
| `trace_id` format and coordination — sync with Pavan | TBD | CF + Proxy |

## Next steps

Once open questions are resolved, this discussion should be:
1. Converted to an ADR capturing the decision rationale
2. Formalized as a spec in `specs/enforcement-api.md`

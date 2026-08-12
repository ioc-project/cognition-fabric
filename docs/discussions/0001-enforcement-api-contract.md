# D1 — Enforcement API Contract

**Status:** Initial agreement

**Date:** 2026-08-11

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
    "workspace_id": "UUID4",
    "mas_id": "UUID4",
    "source_agent_id": "str",
    "destination_agent_id": "str",
    "trace_id": "UUID4/str"
  }
}
```

**Notes:**
- `workspace_id` and `mas_id` semantics need IOC-level agreement, not just CF contract
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

## Open questions

| Item | Status | Owner |
|------|--------|-------|
| `extra` field contents — what headers/metadata are needed? | TBD | CF + Proxy |
| Timeout value — depends on CASA CE response characteristics | TBD | CF + CASA |
| `modify` action semantics — what can be modified and how? | TBD | CF + Proxy |
| `workspace_id` / `mas_id` semantics — needs IOC-level agreement | TBD | IOC |
| `trace_id` format and coordination — sync with Pavan | TBD | CF + Proxy |

## Next steps

Once open questions are resolved, this discussion should be:
1. Converted to an ADR capturing the decision rationale
2. Formalized as a spec in `specs/enforcement-api.md`

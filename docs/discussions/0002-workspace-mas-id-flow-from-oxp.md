# D2 — OXP Identity Propagation for Dynamic MAS Registration

**Status**: Open

**Date:** 2026-08-12

**Parties:** CF Team, OXP Team

## Context

The CF Management plane needs `workspace_id` and `mas_id` when a MAS runs for the first time in order to register it. In the target architecture, OTel telemetry flows directly from the MAS into OXP — the CF stack never sees raw
telemetry. OXP is therefore the first place where MAS identity information lands.

OXP's current identity model stores three promoted columns in the `otel_traces` ClickHouse table:

- `session_id` — identifies a single conversation/run
- `agent_id` — identifies a specific agent within that session
- `application_id` — identifies the MAS (= masName, e.g. "Hercule-Poirot")

`application_id` is set by the MAS instrumentation as a span attribute: the `ObserveSDKPlugin` reads `app_name` from the MAS deployment configuration at startup and stamps it on every span as `SpanAttributes['application_id']`. The
norm-worker then receives a `session_id` via RabbitMQ, fetches all spans for that session from ClickHouse, extracts `application_id`, and writes the KG as: `Session -[:executesSession]-> MAS {masName: application_id}.`  
How the MAS instrumentation sets this span attribute is an assumption — presumably the ObserveSDKPlugin reads the MAS name from deployment configuration at startup and stamps it on every span.


There is no `workspace_id` or `mas_id` concept anywhere in OXP today.

## Current thinking

Since `application_id` is already set as a span attribute from deployment config, `workspace_id` and `mas_id` can follow the same pattern: read them in `ObserveSDKPlugin` at startup, and stamp them on
every span. The values are static per MAS deployment — different tenants deploying the same MAS into different workspaces configure different values. No significant SDK changes are needed beyond accepting the new config fields and
stamping them alongside `application_id` (Assuming application_id is set as a span attribute from deployment config via ObserveSDKPlugin, workspace_id and mas_id can follow the same pattern).

**OXP pipeline changes (minimal):**

1. Add `workspace_id` and `mas_id` columns to the `otel_traces` ClickHouse table, populated from `SpanAttributes['workspace_id']` and
   `SpanAttributes['mas_id']`, exactly as `application_id` is populated today
2. Propagate both fields through the norm-worker into Neo4j, so each MAS node carries `application_id`, `workspace_id`, and `mas_id`

**How the management plane learns about new MAS instances:**

When OXP processes a session with a previously unseen `(application_id, workspace_id, mas_id)` tuple, the management plane needs to create a corresponding MAS entry in CFN. Two options:

- **Subscribe to OXP's RabbitMQ output queue** — the norm-worker already publishes to output queues after writing to Neo4j. The management plane subscribes and reacts when a new session arrives. This is the closest thing to the Notify mechanism shown in the architecture diagram using infrastructure that already exists today.
- **Poll OXP's API layer** — the management plane periodically calls OXP's API to list all known `(application_id, workspace_id, mas_id)` tuples, compares against its own registry, and creates entries for any it doesn't recognise.
  Simpler to implement but less immediate.
  
## Open questions

| Item | Status | Owner |
|------|--------|-------|
| RabbitMQ subscription vs polling — which mechanism for management plane discovery? | TBD | CF + OXP |
| OXP schema changes — does OXP team agree to add `workspace_id` / `mas_id` to `otel_traces`? | TBD | OXP |
| Does `application_id` remain as a separate field, or does `mas_id` replace it in the KG? | TBD | OXP |

## Next steps

- Align with OXP team on the proposed approach
- Confirm with MAS/SDK team how application_id is set on spans today to validate that workspace_id and mas_id can follow the same pattern
- Decide between RabbitMQ subscription vs polling for management plane discovery
- OXP team to assess ClickHouse schema and norm-worker changes

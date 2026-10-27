---
title: Evaluation flow
---

Follow one request through this diagram while watching the [demo logs](logs.md).
It shows the Compose setup with `OXP_API_URL` configured. The Demo CE loads its identity
and content rules from `config.json` at startup.

```mermaid
sequenceDiagram
    autonumber
    participant cfn as CFN
    participant ce as Demo CE
    participant oxp as OXP Runtime Context
    participant store as Cognition Store

    cfn->>ce: Evaluate request over gRPC
    ce->>ce: Log complete request, validate identifiers, MAS scope and identity route
    alt MAS outside configured scope
        ce-->>cfn: DENY with MAS_SCOPE, no OXP or Store access
    else MAS in scope
        ce->>store: GET findings scoped to MAS, trace and optional session
        store-->>ce: Prior findings
        Note over ce,store: Log findings count, their contents do not drive this demo decision
        alt Identity ALLOW and content checks apply
            loop Bounded attempts, stop when ready or invalid
                opt Realtime reference available for this evidence kind
                    ce->>oxp: GET realtime event or span events
                    oxp-->>ce: Pre-call event, pending or endpoint failure
                end
                opt No usable realtime event
                    ce->>ce: Look for pre-call input in local Observe inbox
                end
                opt Known session and causal context lookup applicable
                    ce->>oxp: GET session spans, follow explicit parent and link references
                    oxp-->>ce: Current span and causal ancestors, or unavailable context
                end
                ce->>ce: Validate correlation, select input or await readiness
            end
            Note over ce,oxp: Sources: OXP realtime, inbox, or eligible session/span fallback
            ce->>ce: Evaluate configured content checks on selected input
            Note over ce: Match gives DENY, no match gives ALLOW, missing or invalid required input gives DENY / MISSING_CONTEXT
        else Identity DENY, no content checks, or agent response
            ce->>ce: Retain identity decision, skip content evaluation
        end
        ce->>store: POST one finding with final outcome and reason
        store-->>ce: Acknowledge finding
        ce-->>cfn: Final ALLOW or DENY, checks and context sufficiency
    end
```



## Input selection and failure paths

The CE first attempts an eligible realtime lookup, then checks its local inbox if there is no usable
realtime event. It can use the selected OXP session/span input as fallback where the reference allows it.
Pre-call evidence has priority over span fallback, including evidence arriving while a lookup is in flight.
A pending referenced A2A/MCP carrier is awaited, rather than replaced by the span's input.

| Situation | Result |
|---|---|
| Foreign MAS | DENY with `MAS_SCOPE`, without OXP or Store access |
| Invalid required identifiers | gRPC `InvalidArgument` |
| Local MAS ID cannot be resolved | gRPC `Unavailable` |
| Content rule matches selected input | DENY, naming the matched rule |
| Required evidence is invalid or contradicts correlation | DENY / `MISSING_CONTEXT`, cause `GAP` |
| Required evidence is still missing after the readiness budget | DENY / `MISSING_CONTEXT`, cause `RACE` |
| Store read/write fails | gRPC error, without a successful evaluation response |

Optional OXP history can be unavailable without blocking valid pre-call input. Invalid history correlation
is rejected. Model rules requiring tool definitions must obtain those definitions before deciding.
OXP session/span metadata cannot confirm trace identity, so span fallback or OXP-sourced definitions
report `DEGRADED_ATOMIC`. See the [log events](logs.md) for the evidence source used on an actual request.

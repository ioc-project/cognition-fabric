---
title: Recording walkthrough
---

# Tell the story of one decision

## Prepare the recording

1. Start the surrounding CFN/OXP and demo application stack, then the Demo CE.
2. Onboard the MAS, associate the CE and check that the config uses the same identifiers.
3. Open the application and the CE terminal side by side.
4. Follow the CE logs without the Compose prefix:

```bash
docker compose logs -f --no-log-prefix demo-ce
```

Use one ordinary request and one request that matches a content rule actually present in your demo config.
The bundled config covers `planner-agent` to `search-tool` in `mas-a`, and calls to `llm` in `mas-b`;
replace these samples for the application being recorded.

## Narrate the request

1. **Receive and scope:** CFN sends the complete request. Show `evaluation.start`, then
   `identity.complete` to identify the MAS, caller, destination and configured route.
2. **Read findings:** show `store.read.complete` and the findings count. The CE checks Store
   availability and response shape; it does not use prior finding contents to decide.
3. **Resolve the current input:** show `oxp.realtime.*`, `oxp.context.*` and `evidence.selected`.
   OXP supplies pre-call events and causal context; Observe can also supply pre-call input to the local inbox.
   Earlier activities are context, not the input being checked. A pending referenced A2A/MCP event
   is awaited rather than replaced by the span's own input. Invalid correlation is denied immediately.
4. **Explain the decision:** show `content.complete` and the matching rule, or `content.skipped`.
   Optional history can be absent without blocking valid pre-call input. Required input or tool
   definitions must be available within the retry budget. Span fallback and OXP-sourced tool definitions
   report `DEGRADED_ATOMIC` because OXP does not confirm their trace identity.
5. **Persist and return:** show `store.write.complete` before `evaluation.complete`.
   Only the final finding is persisted, including a content or missing-context DENY.

**Failure paths:** invalid request identifiers return gRPC `InvalidArgument`; an unresolved local
MAS identity returns `Unavailable`. A Store read or write failure interrupts the normal path above:
`evaluation.failed` reports a gRPC error instead of returning a successful evaluation. Cancellation
and deadlines retain their gRPC status. No content check or finding write follows a failed Store read.

## What to show for each outcome

| Scenario | Evidence in the logs |
|---|---|
| Ordinary allowed request | Identity ALLOW, selected input, content ALLOW when applicable, acknowledged finding, final ALLOW |
| Content denied | Identity ALLOW, selected input, matched content rule, one DENY finding, final DENY |
| Foreign MAS | `MAS_SCOPE` and final DENY, with no OXP/Store operations |
| Missing required input | Retries where applicable, final DENY with missing-context cause, one final finding |
| Store unavailable | Read/write failure and `evaluation.failed`, without a successful final decision |

Do not describe the initial identity ALLOW as the final result. Content evaluation can still deny the call.
Likewise, a successful OXP HTTP lookup alone does not prove that the returned event passed correlation.
Show `evidence.selected` and the final evaluation checks.

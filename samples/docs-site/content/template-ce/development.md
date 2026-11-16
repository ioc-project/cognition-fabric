---
title: Extend Template CE
---

# Extend Template CE

## Source map

Paths are relative to the repository root.

| Path | Responsibility |
|---|---|
| `api/ce/proto/ce/v1/ce.proto` | Shared CE gRPC contract |
| `api/ce/v1` | Generated Go bindings used by CFN and Go Demo CE |
| `samples/template-ce/scripts/generate_proto.py` | Generates Python bindings from the shared CE proto |
| `samples/template-ce/src/generated` | Generated Python protobuf and gRPC code |
| `samples/template-ce/src/service.py` | `Evaluate`, `GetInfo` and server lifecycle |
| `samples/template-ce/src/registration.py` | Startup registration and conflict recovery |
| `samples/template-ce/src/mas_sync.py` | Associated-MAS pull and notification apply |
| `samples/template-ce/src/cognition_store.py` | Findings read/write client |
| `samples/template-ce/src/health.py` | Independent health listener |
| `samples/template-ce/src/notification_server.py` | MAS lifecycle notifications |
| `samples/template-ce/tests` | Service, startup, registration and health tests |

## Replace the stub

1. Review the shared CE contract before adding fields.
2. Replace the configured allow/deny branch in `CognitionEngineServicer.Evaluate` with your decision logic.
3. Validate the identifiers and scope needed by that logic before accessing external state.
4. Decide which context is required and what failures mean for your engine.
5. Persist the intended finding and return outcome, reason and your own optional details.
6. Update `GetInfo` to describe the behavior your implementation actually provides.

Template CE and Go Demo CE use bindings generated from the same canonical
`api/ce/proto/ce/v1/ce.proto`. The contract includes `EvaluateRequest.span_id`
(field 18), but the template only logs it; the Go engine requires it to correlate
evidence. Do not assume the template implements that correlation.

## Cognition Store behavior

The template's current findings client catches HTTP failures. Reads return an empty result and writes
return false. An extended engine that requires durable findings must explicitly decide how to handle
these failures; the stub does not enforce that requirement for you.

## Contract changes

Edit `api/ce/proto/ce/v1/ce.proto` and regenerate Go and Python bindings from the
repository root:

```bash
task proto
task proto:check
```

The Template CE generator reads that shared proto directly; there is no separate
template proto to keep aligned.
The common response is outcome/reason; optional `details` contains this CE's own
fields. The template uses `schema: template-ce.v1`, `mode: forced` and
`configured_decision: allow` or `deny`, omitting deprecated CASA diagnostics.
Existing real CEs keep their old bindings and fields. Optional enum presence can
change regenerated source APIs while preserving the binary contract.
Preserve the package-relative import in the generated gRPC module. Do not manually implement new
protobuf fields in generated files. Verify interoperability with CFN after regeneration.

## Validate

```bash
cd samples/template-ce
uv sync --frozen --extra test
uv run --frozen --extra test pytest -v
```

Cover changed outcomes and failure paths, registration metadata and startup/shutdown behavior.
The Go demo's colored logger and OXP correlation resolver are not installed in this Python template.

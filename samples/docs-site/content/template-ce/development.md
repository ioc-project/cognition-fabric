---
title: Extend Template CE
---

# Extend Template CE

## Source map

| Path | Responsibility |
|---|---|
| `template-ce/proto/ce.proto` | Local gRPC contract |
| `template-ce/src/generated` | Generated protobuf and gRPC code |
| `template-ce/src/service.py` | `Evaluate`, `GetInfo` and server lifecycle |
| `template-ce/src/registration.py` | Startup registration and conflict recovery |
| `template-ce/src/cognition_store.py` | Findings read/write client |
| `template-ce/src/health.py` | Independent health listener |
| `template-ce/src/notification_server.py` | MAS lifecycle notifications |
| `template-ce/tests` | Service, startup, registration and health tests |

## Replace the stub

1. Confirm the receiving CFN's contract and reconcile the local proto before adding fields.
2. Replace the always-ALLOW branch in `CognitionEngineServicer.Evaluate` with your decision logic.
3. Validate the identifiers and scope needed by that logic before accessing external state.
4. Decide which context is required and what failures mean for your engine.
5. Persist the intended finding and return the outcome, reason and checks.
6. Update `GetInfo` to describe the behavior your implementation actually provides.

The local template proto and the Go service's imported CFN proto are separate sources.
Both include `EvaluateRequest.span_id` (field 18), but the template only logs it; the Go engine
requires it to correlate evidence. Do not assume the template implements that correlation.

## Cognition Store behavior

The template's current findings client catches HTTP failures. Reads return an empty result and writes
return false. An extended engine that requires durable findings must explicitly decide how to handle
these failures; the stub does not enforce that requirement for you.

## Contract changes

Edit `proto/ce.proto` as the source of truth and regenerate the stubs using compatible `grpcio-tools`.
Preserve the package-relative import in the generated gRPC module. Do not manually implement new
protobuf fields in generated files. Verify interoperability with CFN after regeneration.

## Validate

```bash
cd template-ce
uv sync --extra test
uv run pytest -v
```

Cover changed outcomes and failure paths, registration metadata and startup/shutdown behavior.
The Go demo's colored logger and OXP correlation resolver are not installed in this Python template.

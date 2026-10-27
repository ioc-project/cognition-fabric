---
title: Demo CE overview
---

# Demo CE

Demo CE is a Go service that answers CFN evaluation requests using rules loaded from `config.json`.
An identity rule selects an allowed route or denies it. Content rules can then inspect the current
A2A, MCP or model input using evidence obtained from OXP or the local Observe inbox.

## What the demonstration shows

- A request arrives from CFN with MAS, agent and trace/span identifiers.
- The CE checks scope before accessing findings or runtime context.
- OXP provides pre-call input and causal parent/link context.
- The CE applies the configured checks and persists a single final finding.
- The response returns ALLOW or DENY together with the checks and context sufficiency.

Prior findings are fetched, but their contents do not currently drive the decision.
Only the current call's selected input is checked; ancestors are structural context.
Missing required input is denied. Read and write failures in the configured Store return a gRPC error.

## Boundaries

The CE evaluates calls. CFN invokes it, and the enforcement integration applies the resulting decision.
The CE does not onboard applications, intercept application traffic or install infrastructure.
The root Compose file starts only this service.

## Source map

| Directory | Responsibility |
|---|---|
| `cmd/demo-ce` | Environment configuration, listeners and process lifecycle |
| `pkg/config` | JSON decoding, validation and identity rules |
| `internal/engine` | MAS routing, identity/content evaluation and Store calls |
| `internal/engine/evidence/correlation` | Input selection, OXP correlation and readiness retries |
| `internal/oxp` | OXP realtime, session/span and Cognition Store clients |
| `internal/inbox` | Observe events received at `/events` |
| `internal/cfn` | CFN registration and conflict recovery |
| `internal/logging` | Colored console output, JSON and request correlation |

## Related repositories

The Demo CE calls **CFN** for registration and is called by CFN for evaluation.
It calls the **OXP API** for runtime context and Cognition Store findings. The other components
below provide the onboarding, application traffic, telemetry and enforcement shown in the NOA demo.

| Component | Repository / source | Role in the demo |
|---|---|---|
| Demo CE | [ioc-scale-cf-demo-ce / demo-ce](https://github.com/cisco-eti/ioc-scale-cf-demo-ce/tree/main/demo-ce) | Loads `config.json`, evaluates requests and persists final findings |
| CFN service and CE contract | [ioc-scale-cfn-svc](https://github.com/cisco-eti/ioc-scale-cfn-svc) | Registers CEs and invokes `ioc.ce.v1.CognitionEngine.Evaluate` over gRPC |
| OXP runtime context API | [ioc-scaling-oxp](https://github.com/cisco-eti/ioc-scaling-oxp), [API source](https://github.com/cisco-eti/ioc-scaling-oxp/tree/main/ioc-analytics-api/api) | Serves realtime events and session spans used to resolve the current input and causal context |
| Cognition Store API | [cognition_store.py](https://github.com/cisco-eti/ioc-scaling-oxp/blob/main/ioc-analytics-api/api/oxp/api/api_v1/endpoints/cognition_store.py) in the same OXP repository | Reads prior findings and accepts the final ALLOW/DENY finding; it is not a separate CE |
| Observe SDK | [agntcy/observe](https://github.com/agntcy/observe) | Instruments the MAS and publishes runtime events for OXP and the CE inbox |
| Enforcement proxy | [ioc-scaling-enforcement-proxy](https://github.com/cisco-eti/ioc-scaling-enforcement-proxy) | Envoy integration and mediation of A2A/MCP/LLM calls through CFN |
| NOA demo orchestration | [ioc-scaling-demos / noa](https://github.com/cisco-eti/ioc-scaling-demos/tree/main/noa) | Runs the demo with Compose and selects the enforcement adapter |
| NOA application sources | [oxp-sample-apps](https://github.com/cisco-eti/oxp-sample-apps) | Source repository for the NOA trip-planner applications used by the demo |
| CF management API | [ioc-scale-cf-mgmt-svc](https://github.com/cisco-eti/ioc-scale-cf-mgmt-svc) | Management API behind manual MAS onboarding and CE association |
| CFN UI | [ioc-scale-cf-ui](https://github.com/cisco-eti/ioc-scale-cf-ui) | Onboards the MAS and associates its Demo CE |
| Shared platform deployment | [ioc-scale-cf-deployment](https://github.com/cisco-eti/ioc-scale-cf-deployment) | Platform Compose configuration and supporting databases, brokers, collectors and OXP workers |

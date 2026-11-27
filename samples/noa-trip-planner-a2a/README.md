# NOA A2A trip planner

This sample runs a moderator, three specialist agents, and an MCP tool server.
The Enforcement Proxy intercepts HTTP A2A, MCP, and model gateway requests,
asks CFN for decisions, and sends the resulting audit records to CFN.

The application source and dependency lock come from the
[NOA Trip Planner A2A sample](https://github.com/cisco-eti/oxp-sample-apps/tree/6b4da24918407baef7b3e585638a6f0131e36fa9/noa-trip-planner-a2a).
This checkout supplies the container build, CF onboarding declaration, and
deployment configuration.

## Run with CF

Follow the [local setup](../../dev/README.md#noa-onboarding-and-proxy-mode)
to start CF and onboard [the NOA MAS](mas/README.md). In root `.env`, set
`AI_GATEWAY_BASE_URL` to your OpenAI-compatible Chat Completions base URL,
`AI_GATEWAY_API_KEY` to the provider credential, and `NOA_LLM_MODEL` to the
provider's tool-capable model name. From the monorepo root, run
`task run:full-mas`. The task builds the app from this directory and pulls
the Proxy sidecar, Wasm module, operator, and MCP ingress guard from GHCR.
The API listens on `http://127.0.0.1:8125` by default.

```bash
curl --fail http://127.0.0.1:8125/ready
curl --fail http://127.0.0.1:8125/ask \
  -H 'Content-Type: application/json' \
  -d '{"question":"Show me train schedules from Luminos to Celestia."}'
```

Use `task noa:status` and `task proxy:logs` to inspect the runtime.
Run `task test:noa` from the monorepo root to run the application tests.

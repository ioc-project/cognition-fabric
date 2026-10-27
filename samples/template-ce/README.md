# Template CE

Template Cognition Engine implementing the `ioc.ce.v1.CognitionEngine` gRPC contract.
The implementation, Dockerfile and tests are retained for CE teams. The repository's Compose deployment
runs `demo-ce`; use the local instructions below to run this template.

## Overview

Template CE provides authorization decisions (ALLOW / DENY / MODIFY) for in-scope MAS actions. It integrates with:

- **CFN** - Receives `Evaluate` requests via gRPC
- **Cognition Store (OXP)** - Reads prior findings, stores current finding

This branch supports a forced verdict through `TEMPLATE_CE_DECISION=allow`
(default) or `TEMPLATE_CE_DECISION=deny`. A forced denial carries a simulated
intent-deviation reason; it does not inspect tool arguments or make a semantic
policy judgment. Restart the template CE after changing the setting.

## Run Locally (without Docker)

```bash
cd template-ce
uv sync --extra test
HEALTH_PORT=8081 uv run python -m src
```

Server runs on `localhost:50051` (gRPC)

### With integrations

```bash
export CFN_URL="http://localhost:9002"
export COGNITION_STORE_URL="http://localhost:8000"
uv run python -m src
```

## Test

```bash
cd template-ce
uv run pytest -v
```

## gRPC API

### `Evaluate` RPC

Authorization decision for an in-scope MAS action.

**Request:** `EvaluateRequest`
- `mas_id`, `source_agent_id`, `destination_agent_id`, `trace_id`
- `action_class` - MCP_TOOL_CALL, A2A_DELEGATION, AGENT_RESPONSE
- `direction` - REQUEST, RESPONSE

**Response:** `EvaluateResponse`
- `outcome` - ALLOW, DENY, MODIFY
- `reason` - Human-readable explanation
- `trace_id` - Echo of request

### `GetInfo` RPC

Returns CE metadata.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CE_NAME` | CE name for registration | `template-ce` |
| `CE_VERSION` | CE version for registration | `1.0.0` |
| `TEMPLATE_CE_DECISION` | Forced verdict for the local template | `allow` |
| `GRPC_PORT` | gRPC server port | `50051` |
| `CFN_URL` | CFN service URL for registration | (disabled) |
| `COGNITION_ENGINE_HOST` | Advertised host for this CE | `localhost` |
| `HEALTH_PORT` | HTTP port serving `GET /healthz` (CFN probes it). An invalid value fails startup | `8080` |
| `COGNITION_STORE_URL` | Cognition Store API URL | (disabled) |

### Listener ports

Use `HEALTH_PORT=8081` for local development. The notification server binds port `8080`,
which also happens to be the default health port. Separate them to start successfully.
The notification listener is currently fixed at `8080`; changing `HTTP_PORT` affects the
advertised registration URL, not the listener. Concurrent instances need separate network namespaces.

See the [documentation site source](../docs/README.md) for setup and extension guidance.

## Architecture

```
┌───────────────┐   Evaluate    ┌─────────────┐   read/write    ┌─────────────────┐
│      CFN      │─────────────▶│ Template CE │◀───────────────▶│  Cognition      │
│               │◀────────────│    gRPC     │                 │  Store (OXP)    │
└───────────────┘   decision   └─────────────┘                 └─────────────────┘
```

## Files

```
template-ce/
├── proto/ce.proto           # ioc.ce.v1 Protocol Buffer definition
├── src/
│   ├── generated/           # Generated gRPC stubs
│   ├── service.py           # gRPC server
│   ├── registration.py      # CFN registration
│   └── cognition_store.py   # Cognition Store client
├── tests/
├── pyproject.toml
└── Dockerfile
```

# CASA Cognition Engine

CASA (Continuous Agent Semantic Authorization) Cognition Engine implementing the `ioc.ce.v1.CognitionEngine` gRPC contract.

## Overview

CASA CE provides authorization decisions (ALLOW / DENY / MODIFY) for in-scope MAS actions. It integrates with:

- **CFN** - Receives `Evaluate` requests via gRPC
- **Cognition Store (OXP)** - Reads prior findings, stores current finding

## Run Locally

```bash
uv sync
uv run python -m src.service
```

Server runs on `localhost:50051` (gRPC)

### With CFN Registration

```bash
export CFN_URL="http://localhost:9002"
export COGNITION_ENGINE_HOST="localhost"
uv run python -m src.service
```

### With Cognition Store

```bash
export COGNITION_STORE_URL="http://localhost:8080"
uv run python -m src.service
```

## Test

```bash
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
| `GRPC_PORT` | gRPC server port | `50051` |
| `CFN_URL` | CFN service URL for registration | (disabled) |
| `COGNITION_ENGINE_HOST` | Advertised host for this CE | `localhost` |
| `CE_HEARTBEAT_INTERVAL_SEC` | Heartbeat interval | `30.0` |
| `COGNITION_STORE_URL` | Cognition Store API URL | (disabled) |

## Architecture

```
┌───────────────┐   Evaluate    ┌─────────┐    read/write     ┌─────────────────┐
│      CFN      │──────────────▶│ CASA CE │◀────────────────▶│  Cognition      │
│               │◀──────────────│  gRPC   │                   │  Store (OXP)    │
└───────────────┘   decision    └─────────┘                   └─────────────────┘
```

## Files

```
engines/casa/
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

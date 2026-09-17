# CASA Cognition Engine

CASA (Continuous Agent Semantic Authorization) Cognition Engine Service implementing the `ioc.ce.v1.CognitionEngine` gRPC contract.

## Overview

CASA CE is the intent-scoped authorization guardrail Cognition Engine. It decides **ALLOW / DENY / MODIFY** for in-scope MAS actions by combining deterministic checks (rule-based) with semantic checks (AI-powered). CASA CE **decides**; the Enforcement Proxy **enforces**.

Based on the specification in [ioc-governance-casa-ce/docs/specs/ce-grpc-contract.md](../../ioc-governance-casa-ce/docs/specs/ce-grpc-contract.md).

## Features

- **gRPC `Evaluate` RPC** - Authorization decision for in-scope MAS actions
- **gRPC `GetInfo` RPC** - Returns CE capabilities and enabled checks
- **Three Action Classes** - MCP tool calls, A2A delegations (L9 messages), agent responses
- **Bidirectional Inspection** - Both REQUEST and RESPONSE directions
- **Check Framework** - 2 deterministic + 4 semantic checks (stub implementations)
- **CE Registration** - Automatically registers with CFN on startup (idempotent)
- **Heartbeat** - Sends periodic heartbeats to CFN to maintain "online" status

## Run Locally

```bash
# Install dependencies
uv sync

# Run gRPC server (standalone mode - no CFN registration)
uv run python -m src.service
```

Server runs on `localhost:50051` (gRPC)

### Run with CFN Registration

To register with Cognition Fabric (CFN):

```bash
# Required: Set CFN URL
export CFN_URL="http://localhost:9002"

# Optional: customize CE configuration
export COGNITION_ENGINE_HOST="localhost"
export GRPC_PORT="50051"
export CE_HEARTBEAT_INTERVAL_SEC="30.0"
export MAS_AUTO_ASSOCIATE="false"

# Run server
uv run python -m src.service
```

On startup, the CE will:
1. Start gRPC server on port 50051
2. Register with CFN at `$CFN_URL/api/cognition-engines`
3. Receive a `ce_id` (idempotent - same ID on subsequent starts)
4. Start heartbeat background task (every 30s by default)
5. Appear as "online" in Management Plane

## Test

```bash
# Run tests
uv run pytest -v
```

## gRPC API

### `Evaluate` RPC

Authorization decision for an in-scope MAS action.

**Request fields:**
- `mas_id` - MAS identifier
- `source_agent_id` / `destination_agent_id` - Agent identifiers
- `trace_id` - W3C trace correlation ID
- `action_class` - `ACTION_CLASS_MCP_TOOL_CALL`, `ACTION_CLASS_A2A_DELEGATION`, or `ACTION_CLASS_AGENT_RESPONSE`
- `direction` - `DIRECTION_REQUEST` or `DIRECTION_RESPONSE`
- `original_intent` - The input that opened the thread
- `tool_call` / `a2a_delegation` / `agent_response` - Action-specific details

**Response fields:**
- `outcome` - `DECISION_ALLOW`, `DECISION_DENY`, or `DECISION_MODIFY`
- `denial_reason` - `DENIAL_REASON_DEVIATES_FROM_INTENT` or `DENIAL_REASON_MISSING_CONTEXT` (on DENY)
- `checks_run` - Results of all checks that executed
- `context_sufficiency` - Whether MAS-level context was complete
- `trace_id` - Echo of request trace_id

### `GetInfo` RPC

Returns CE capabilities and metadata.

**Response fields:**
- `ce_type` - "CASA"
- `version` - CE version
- `enabled_checks` - List of enabled check IDs
- `matcher_strategy` - Matcher strategy in effect

## Checks

### Deterministic Checks (rule-based, fast)

| Check ID | Description |
|----------|-------------|
| `DETERMINISTIC_TOOL_SELECTED` | Is the requested tool in the session's allowed-tool list? |
| `DETERMINISTIC_LLM_SELECTED_TOOLS` | Did the LLM actually select this tool? |

### Semantic Checks (AI-powered)

| Check ID | Inspects | Allows | Blocks |
|----------|----------|--------|--------|
| `SEMANTIC_A2A_TASK_RELEVANCE` | Delegated A2A task (request) | Delegations that refine/decompose/continue the task | Unrelated work |
| `SEMANTIC_A2A_RESPONSE_RELEVANCE` | Agent response (response) | Responses that answer/advance the task | Off-topic responses |
| `SEMANTIC_MCP_TOOL_RELEVANCE` | Tool call (request) | Calls that support the task | Authorized but irrelevant tools |
| `SEMANTIC_A2A_RESPONSE_GROUNDING` | Response claims (response) | Claims supported by consulted sources | Ungrounded claims |

**Note:** All checks are currently stub implementations that return PASS.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CFN_URL` | CFN service base URL (e.g. "http://localhost:9002") | `""` (standalone) |
| `COGNITION_ENGINE_HOST` | Advertised host for this CE | `"localhost"` |
| `GRPC_PORT` | gRPC server port | `"50051"` |
| `CE_HEARTBEAT_INTERVAL_SEC` | Heartbeat interval in seconds | `"30.0"` |
| `MAS_AUTO_ASSOCIATE` | Auto-associate CE with all MAS | `"false"` |
| `COGNITION_STORE_URL` | Cognition Store API base URL | `""` (disabled) |

## Architecture

### Evaluate Flow

```
┌───────────────┐   Evaluate    ┌─────────┐    get_prior_findings    ┌─────────────────┐
│  Enforcement  │──────────────▶│ CASA CE │◀─────────────────────────│  Cognition      │
│     Proxy     │◀──────────────│  gRPC   │─────────────────────────▶│  Store (OXP)    │
└───────────────┘   decision    └────┬────┘    store_finding         └─────────────────┘
                                     │
                              ┌──────┴──────┐
                              │   Checks    │
                              │ (det+sem)   │
                              └─────────────┘
```

### Cognition Store Integration

CASA CE integrates with the Cognition Store (part of OXP backend) for:

1. **Prior Findings** - Before evaluation, fetches prior CE findings for the MAS to provide trajectory context for semantic checks
2. **Store Finding** - After evaluation, stores the current finding for audit logging and future context

If `COGNITION_STORE_URL` is not set, CASA CE operates without Cognition Store (standalone mode).

### Registration Flow

```
┌─────────────────┐
│   CASA CE       │
│  (startup)      │
└────────┬────────┘
         │
         │ 1. POST /api/cognition-engines
         │    {ce_type, base_url: "host:50051", endpoint: "ioc.ce.v1.CognitionEngine"}
         ▼
┌─────────────────┐
│      CFN        │
│  (forwards to   │
│  Mgmt Plane)    │
└────────┬────────┘
         │
         │ 2. Forward to Management Plane
         ▼
┌─────────────────┐
│  Management     │
│    Plane        │
│  (generates     │
│   ce_id)        │
└────────┬────────┘
         │
         │ 3. Returns {ce_id, ce_type, status, ...}
         ▼
┌─────────────────┐
│   CASA CE       │
│  (stores ce_id, │
│   starts        │
│   heartbeat)    │
└─────────────────┘
```

## Files

```
engines/casa/
├── proto/
│   └── ce.proto              # ioc.ce.v1 Protocol Buffer definition
├── src/
│   ├── generated/            # Generated gRPC stubs (ce_pb2.py, ce_pb2_grpc.py)
│   ├── service.py            # gRPC server with CognitionEngineServicer
│   ├── models.py             # Pydantic models for internal use
│   ├── checks.py             # Check framework (deterministic + semantic)
│   └── registration.py       # CE registration and lifecycle management
├── tests/                    # Unit tests (99 tests)
├── pyproject.toml            # Dependencies and project config
└── Dockerfile                # Container build
```

## Regenerating gRPC Stubs

If you modify `proto/ce.proto`:

```bash
uv run python -m grpc_tools.protoc \
  -I./proto \
  --python_out=./src/generated \
  --grpc_python_out=./src/generated \
  ./proto/ce.proto

# Fix import in generated file
sed -i '' 's/import ce_pb2/from . import ce_pb2/' src/generated/ce_pb2_grpc.py
```

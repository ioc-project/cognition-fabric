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
cd samples/template-ce
uv sync --extra test
uv run python -m src
```

Server runs on `localhost:50051` (gRPC), notifications on `8080`, health on `8081`.

### With integrations

```bash
export CFN_URL="http://localhost:9002"
export COGNITION_STORE_URL="http://localhost:8081"
uv run python -m src
```

## Run against the local CF stack

From the repository root, with local infrastructure and CFN running, choose
`task run:template-ce` for source or `task run:template-ce:image` for the
published image. Stop the running Template CE task before switching modes.
Set `CF_TEMPLATE_CE_TAG` in root `.env` or the shell to select an image tag. It
defaults to `latest`. Both tasks set `HEALTH_PORT=8082` because the SCOPE API uses
host port `8081` and CFN probes the health port the CE registers.

## Test

```bash
cd samples/template-ce
uv run pytest -v
```

## gRPC API

### `Evaluate` RPC

Authorization decision for an in-scope MAS action.

**Request:** `EvaluateRequest`
- `mas_id`, `source_agent_id`, `destination_agent_id`, `trace_id`, `span_id`
- `action_class` - MCP_TOOL_CALL, A2A_DELEGATION, AGENT_RESPONSE
- `direction` - REQUEST, RESPONSE

**Response:** `EvaluateResponse`
- `outcome` - ALLOW, DENY, MODIFY
- `reason` - Human-readable explanation
- `trace_id` - Echo of request
- `details` - `{"schema":"template-ce.v1","mode":"forced","configured_decision":"allow"}`
  (or `deny`). The four deprecated CASA diagnostic fields are omitted.

The response remains readable by older CFN/CE clients using their existing
bindings. Existing real CEs can keep returning legacy diagnostics unchanged.
See [the shared response contract](../../api/ce/docs/ce-evaluation-response.md).

Regenerate and check the Python bindings using the locked toolchain:

```bash
uv run --frozen python scripts/generate_proto.py
uv run --frozen python scripts/generate_proto.py --check
```

The helper preserves package-relative generated imports. Never regenerate the
frozen legacy descriptor in `tests/fixtures/` from the new contract.

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
| `HEALTH_PORT` | HTTP port serving `GET /healthz` (CFN probes it). An invalid value fails startup | `8081` |
| `HTTP_PORT` | HTTP port for `POST /notification` (advertised and bound) | `8080` |
| `COGNITION_STORE_URL` | Cognition Store API URL | (disabled) |

### Listener ports

Defaults are gRPC `50051`, notifications `8080`, health `8081`. `HTTP_PORT` binds the
notification listener and is advertised as `notification_url`. Both local CF tasks
use health port `8082`. Concurrent standalone instances need separate network
namespaces or distinct port triples.

See the [documentation site source](../docs-site/README.md) for setup and extension guidance.

## MAS lifecycle summaries

After a successful register or PATCH the template pulls
`GET /api/cognition-engine/{ceId}/multi-agentic-systems` until CFN returns 200
(retry 404/503/network; an empty `mas_ids` list is terminal). It then GETs each
MAS. Notifications are acked immediately (`2xx`); `mas.created` / `mas.updated`
fetch asynchronously, `mas.deleted` drops local state without a GET. A GET-by-id
404 means that MAS is gone — it is not retried like discovery 404.

When a MAS is fetched, the template emits one readable INFO summary containing
the MAS ID, name, workspace and description; each agent's runtime ID, name and
description; topology source availability, nodes, directed edges and agent tool
assignments; and runtime tool IDs, names, short descriptions and optional MCP
bindings. Tool descriptions use their first nonempty line.

Missing or null optional fields are shown as `not supplied`. Explicit empty lists
are shown as `none`; an explicitly empty graph remains a declared graph. Start/end
markers and either topology source are supported when present. Configuration,
schemas, raw document snapshots and provenance are excluded from this summary.

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
├── scripts/generate_proto.py # reads canonical ../../api/ce/proto/ce/v1/ce.proto
├── src/
│   ├── generated/           # Generated gRPC stubs
│   ├── service.py           # gRPC server
│   ├── registration.py      # CFN registration
│   ├── mas_sync.py          # Associated-MAS pull and notification apply
│   └── cognition_store.py   # Cognition Store client
├── tests/
├── pyproject.toml
└── Dockerfile
```

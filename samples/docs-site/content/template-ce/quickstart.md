---
title: Run Template CE
---

# Run Template CE

## Prerequisites

Install Python 3.11 or newer and `uv`. Run these commands from the repository root:

```bash
cd template-ce
uv sync --extra test
HEALTH_PORT=8081 uv run python -m src
```

The selected ports are:

| Listener | Port | Purpose |
|---|---|---|
| gRPC | `50051` | `Evaluate`, `GetInfo` and reflection |
| Health | `8081` in this command | `GET /healthz` |
| Notifications | `8080` | `POST /notification` and `GET /health` |

:::info Keep the health and notification listeners separate
The implementation defaults both to `8080`. Set `HEALTH_PORT=8081` for a native run to avoid the port
collision. The notification listener is currently fixed at `8080`; `HTTP_PORT` changes the advertised
registration URL but does not change the bound notification port.
:::

Check the health listener:

```bash
curl -i http://localhost:8081/healthz
grpcurl -plaintext localhost:50051 list ioc.ce.v1.CognitionEngine
```

Without `CFN_URL`, the service runs without registration. Without `COGNITION_STORE_URL`, it skips
finding reads and writes. The evaluator still returns the stub decision.

## Connect integrations

```bash
CFN_URL=http://localhost:9002 \
  COGNITION_STORE_URL=http://localhost:8000 \
  COGNITION_ENGINE_HOST=localhost \
  HEALTH_PORT=8081 \
  uv run python -m src
```

The advertised host must be reachable from CFN. For a containerized CFN, its own `localhost` is not
the host running this Python process; choose the address for that network.

## Run tests

```bash
uv run pytest -v
```

Install the test extra as shown above before running the suite.
The template has its own Dockerfile, but is not published by the root CI workflow.
Its listener configuration needs the same care when run in a container.

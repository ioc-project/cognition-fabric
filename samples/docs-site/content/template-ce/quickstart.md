---
title: Run Template CE
---

# Run Template CE

## Prerequisites

Install Python 3.11 or newer and `uv`. Run these commands from the repository root:

```bash
cd template-ce
uv sync --extra test
uv run python -m src
```

The selected ports are:

| Listener | Port | Purpose |
|---|---|---|
| gRPC | `50051` | `Evaluate`, `GetInfo` and reflection |
| Health | `8081` | `GET /healthz` |
| Notifications | `8080` | `POST /notification` and `GET /health` |

:::info Image vs CF source stack
The published image and a native `uv run` default health to **8081**.
`task run:template-ce` on the CF source stack sets `HEALTH_PORT=8082` because OXP already uses 8081.
Do not change CFN deploy ports to match the image.
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
  uv run python -m src
```

The advertised host must be reachable from CFN. For a containerized CFN, its own `localhost` is not
the host running this Python process; choose the address for that network.

## Run tests

```bash
uv run pytest -v
```

Install the test extra as shown above before running the suite.
The template has its own Dockerfile. CI publishes
`ghcr.io/ioc-project/ioc-scale-cf-demo-ce/template-ce:latest` from `main`; a Git tag
publishes the same name with that tag and does not move `latest`.
The image exposes 50051, 8080 and 8081. Override `HEALTH_PORT` only when those
host ports are already taken, such as the CF local stack.

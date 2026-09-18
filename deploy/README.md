# ioc-scale-cf-deployment

Deployment configurations for the IOC Scale - Cognition Fabric (CF) stack.

## Quick Start

1. Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

2. Start the stack:
   ```bash
   docker compose up -d                      # 15 containers
   docker compose --profile full-mas up -d   # 16, adds the NOA sample app
   ```

All images are pulled from GHCR; nothing is built locally. The sample app is
the only profiled service; everything else starts either way.

The one image whose source lives in this repo is the database. See
[`docker-db/`](docker-db/) for the Dockerfile and how to publish a new tag.

## Services

| Service | Port | Description |
|---------|------|-------------|
| `ioc-scale-db` | 5456 | AgensGraph + pgvector + TimescaleDB database. Built from [`docker-db/`](docker-db/) in this repo |
| `ioc-scale-cf-mgmt-svc` | 9000 | Management backend API |
| `ioc-scale-cf-mgmt-plane-ui` | 9001 | Management plane UI (Next.js) |
| `ioc-scale-cfn-svc` | 9002 (HTTP), 9003 (gRPC) | Cognition Fabric Node |
| `ioc-scale-cf-cognition-engine` | 8000 | Cognition engines |

### OXP infrastructure

| Service | Port | Description |
|---------|------|-------------|
| `rabbitmq` | 5672 (AMQP), 15672 (management UI) | Message broker for the worker pipeline |
| `neo4j` | 7474 (HTTP), 7687 (Bolt) | Knowledge graph store |
| `clickhouse-server` | 8123 (HTTP), 9009 (native TCP) | Raw telemetry store the workers read sessions from |
| `otel-collector` | 4317 (OTLP gRPC), 4318 (OTLP HTTP) | Receives spans from instrumented apps and writes them to ClickHouse |

ClickHouse publishes its native port on host `9009` rather than `9000`, which
already belongs to `ioc-scale-cf-mgmt-svc`. Inside the compose network it is
still reached on `9000`, which is what
[`otel-collector-config.yaml`](otel-collector-config.yaml) points at.

Point an instrumented application at `http://localhost:4318` (or
`http://otel-collector:4318` from inside the network) to get its traces into
the pipeline.

#### Connecting ClickHouse to the workers

The collector writes spans, but it does not know about the columns the workers
read or about RabbitMQ. Those are added by hand, once, after the collector has
received its first span: `session_id`, `application_id`, and `agent_id` as
materialized columns on `otel_traces`, plus a materialized view that publishes
each `session.end` span to the `claris` exchange with routing key
`new_session_in` — the queue `norm` reads from. They persist in the
`oxp_clickhouse_data` volume.

See [`scripts/README.md`](scripts/README.md) for the statements and how to run
them.

### OXP workers

Pipeline workers from `claris-lib`. They expose no ports and communicate over
RabbitMQ, entering at `norm` and fanning out from there.

| Service | Description |
|---------|-------------|
| `norm` | Normalization; pipeline entry point |
| `embedding` | Generates embeddings |
| `mce` | Metric computation |
| `grouping` | Session grouping |
| `analysis` | Analysis layer |
| `hierarchical-grouping` | Hierarchical grouping |

### MAS sample app

| Service | Port | Description |
|---------|------|-------------|
| `noa-trip-planner` | 8125 | Multi-agent trip planner that emits OTLP spans into the collector |

Nothing in the stack produces traces on its own, so without this there is
nothing for the workers to process. It is the only profiled service, started
with `--profile full-mas`, which keeps the rest of the stack usable without a
gateway key. Port 8125 rather than 8000, which belongs to
`ioc-scale-cf-cognition-engine`.

Ask it something once the stack is up:

```bash
curl -X POST http://localhost:8125/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"Plan a 1-day trip to Celestia"}'
```

The session only reaches Neo4j after the app emits its `session.end` span,
which the SDK sends on a five-minute idle timeout or at exit.

## Configuration

See `.env.example` for all available configuration options. Key settings:

- `IOC_SCALE_DB_*` - Database credentials
- `ADMIN_USER_PASSWORD` - Admin password for mgmt backend
- `CLARIS_REGISTRY`, `CLARIS_IMAGE_TAG` - Source and version of the worker images
- `AI_GATEWAY_API_KEY`, `OPENAI_API_KEY` - Required by `embedding`, `mce`, and
  `analysis`. Without them those workers exit on startup and restart in a loop.
  The two are read by different workers and can hold the same gateway key.
- `AI_GATEWAY_BASE_URL` - Endpoint the `embedding` worker calls. Set it when
  using a gateway; it otherwise defaults to `https://api.openai.com/v1`.
- `CLICKHOUSE_*` - Read by the workers and the OTel collector. `CLICKHOUSE_HOST`
  defaults to the bundled `clickhouse-server`; set it to `host.docker.internal`
  to use an external instance instead.
- `NOA_*` - The sample app. It reuses `AI_GATEWAY_BASE_URL` and
  `AI_GATEWAY_API_KEY`, so that key needs the chat model on its allow-list too.
  `NOA_API_PORT` moves the host port only; the app always listens on 8125 inside
  the container. `NOA_ENABLE_SIMULATED_DELAY` and the `NOA_DELAY_*` values pad
  out a session when you want a slower one to watch.

### Architecture

Platform is set per service through the environment, because the images differ:

- `CLARIS_WORKER_PLATFORM` (default `linux/amd64`) - the worker images are
  published for amd64 only.
- `OXP_INFRA_PLATFORM` (default `linux/arm64`) - RabbitMQ and Neo4j. These must
  match the host architecture; RabbitMQ's Erlang runtime crashes during
  feature-flag setup when emulated. Set to `linux/amd64` on an Intel/AMD host.

## Access

Pulling the worker images requires access to the `cisco-eti` GHCR packages:

```bash
echo "$GITHUB_TOKEN" | docker login ghcr.io -u "$GITHUB_USERNAME" --password-stdin
```

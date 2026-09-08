# ioc-scale-cf-deployment

Deployment configurations for the IOC Scale - Cognition Fabric (CF) stack.

## Quick Start

1. Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

2. Start the stack:
   ```bash
   docker compose up -d
   ```

All images are pulled from GHCR; nothing is built locally. The full stack is
13 containers.

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

## Configuration

See `.env.example` for all available configuration options. Key settings:

- `IOC_KNOWLEDGE_DB_*` - Database credentials
- `ADMIN_USER_PASSWORD` - Admin password for mgmt backend
- `CLARIS_REGISTRY`, `CLARIS_IMAGE_TAG` - Source and version of the worker images
- `AI_GATEWAY_API_KEY`, `OPENAI_API_KEY` - Required by `embedding`, `mce`, and
  `analysis`. Without them those workers exit on startup and restart in a loop.
  The two are read by different workers and can hold the same gateway key.
- `AI_GATEWAY_BASE_URL` - Endpoint the `embedding` worker calls. Set it when
  using a gateway; it otherwise defaults to `https://api.openai.com/v1`.

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

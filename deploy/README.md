# Deploy the Cognition Fabric stack

Deployment configurations for the IOC Scale - Cognition Fabric (CF) stack.

## Quick Start

Run these commands from the monorepo root.

1. Copy the root environment template and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

2. Edit `deploy/demo-ce/config/config.json` with your MAS id and agent identities
   (see [Demo CE](#demo-ce)).

3. Use the Makefile to check configuration and start the stack:
   ```bash
   make -C deploy doctor
   make -C deploy up
   make -C deploy up profile=full-mas     # adds the NOA sample app
   ```

The Makefile loads root `.env`, checks the required settings and waits until every
service is running, healthy or finished:

```bash
make -C deploy status                  # list containers
make -C deploy logs service=ioc-analytics-api # follow one service (omit service= for all)
make -C deploy pull                    # pull the configured images
make -C deploy up enforcement=envoy    # add an optional enforcement flavor (or shadi)
make -C deploy down                    # stop the stack, volumes are preserved
```

To use Compose directly from the monorepo root, load the same environment:

```bash
docker compose --env-file .env -f deploy/docker-compose.yml up -d
docker compose --env-file .env -f deploy/docker-compose.yml --profile full-mas up -d
```

`make -C deploy up` waits up to 180 seconds (`STACK_WAIT_TIMEOUT`) and names any service
that is not ready. SCOPE normalization needs no LLM credentials; on-demand API
metrics and the optional NOA sample may require them.
The Compose project name is pinned to `ioc-scale-cf-deployment`, so the
stack and its default network keep the same names from any checkout.
See [`scripts/run-stack.sh`](scripts/run-stack.sh).

All images are pulled from GHCR; nothing is built locally. The sample app is
the only profiled service; the Go Demo CE starts by default.

Every image is composed as `${REGISTRY}/<image>:${TAG}`, so registry and tag
can be overridden in root `.env` without editing the compose file:

- CF and database services (`ioc-scale-db`, `ioc-scale-cf-mgmt-svc`,
  `ioc-scale-cf-mgmt-plane-ui`, `ioc-scale-cfn-svc`, `ioc-scale-cf-demo-ce`):
  `CF_REGISTRY` plus `IOC_SCALE_DB_TAG`, `CF_MGMT_SVC_TAG`, `CF_UI_TAG`,
  `CFN_SVC_TAG`, `CF_DEMO_CE_TAG`. The registry defaults to `ghcr.io/ioc-project`;
  the database stays pinned to `0.2.0` and CF application tags default to `latest`.
- Enforcement Proxy services: `PROXY_REGISTRY` defaults to `ghcr.io/cisco-eti`,
  independently of CF. The mediation image uses `ENFORCEMENT_PROXY_MEDIATION_TAG`;
  Envoy and SHADi overlays use their respective `ENFORCEMENT_*_TAG` settings.
  These deployment tags remain `0.0.1-alpha`.
- SCOPE images: `SCOPE_REGISTRY` defaults to `ghcr.io/ioc-project/container-images`.
  `norm` uses `scope-norm-worker` with `SCOPE_IMG_TAG`.
  `ioc-analytics-api` uses `scope-cognition-fabric-ioc-analytics-api` with
  `SCOPE_API_IMG_TAG`; `event-exporter` uses `scope-cognition-fabric-event-exporter`
  with `SCOPE_EVENT_EXPORTER_IMG_TAG`. All tags default to `latest`.
  Set `SCOPE_API_IMAGE` only to override the full API image reference.
- Legacy NOA sample app: `CLARIS_REGISTRY` plus `NOA_IMAGE_TAG`. Its existing
  image is retained until a replacement is available.

Existing `.env` values take precedence over these defaults. To adopt the new CF
images in an existing configuration, change `CF_REGISTRY` to
`ghcr.io/ioc-project`. If Proxy images previously used a custom `CF_REGISTRY`,
set that location explicitly through `PROXY_REGISTRY`.

#### Migrating an existing deployment

The SCOPE integration follows `scope/integrations/cognition-fabric`: only `norm`
runs as a background worker; enrichment and metrics are served on demand by the
API. The former `embedding`, `mce`, `grouping`, `analysis`,
`hierarchical-grouping`, `decision-block` and `stateful-eval` containers and the
MCE config mount have been removed.

Update root `.env` overrides: replace `OXP_REGISTRY`, `OXP_IMG_TAG`,
`OXP_API_IMG_TAG`, `OXP_API_IMAGE`, `OXP_POSTGRES_DB`, `OXP_INFRA_PLATFORM`,
`OXP_INIT_DELAY_SECONDS` and `CLARIS_WORKER_PLATFORM` with the corresponding
`SCOPE_*` settings (worker platform is `SCOPE_WORKER_PLATFORM`). Use the new
registry above rather than carrying over the old registry value. Add
`SCOPE_EVENT_EXPORTER_IMG_TAG` if pinning the exporter release.

Before upgrading, stop the old deployment using its old Compose file. If it has
already been replaced, inspect `docker compose --env-file .env -f
deploy/docker-compose.yml ps -a --orphans` and remove only the retired containers
owned by this deployment. Avoid blanket `--remove-orphans` cleanup: local CF and
enforcement workflows can share this project. The project/network name and legacy
`oxp_*` volume keys are intentionally unchanged so existing ClickHouse and Neo4j
data is reused. Do not remove volumes during the upgrade.

The database image source is in this directory. See
[`docker-db/`](docker-db/) for the Dockerfile and how to publish a new tag.

### Demo CE

`ioc-scale-cf-demo-ce` is the Go [Demo CE](../samples/demo-ce/README.md).
It registers with CFN and evaluates identity and content rules per MAS from a
JSON config file. It is the default CE for both `make -C deploy up` and the direct Compose commands above.

The CE waits for CFN to become healthy, then registers with `enforcing_url`
and `enforcing_endpoint` for gRPC, plus `health_url` and `health_endpoint`
(`/healthz`) for HTTP health probes. An existing registration is updated by
PATCH after a conflict. The CE sends no heartbeats after registration; CFN
probes its health endpoint. `/readyz` returns 200 after registration succeeds.

When upgrading, run `make -C deploy pull` before `make -C deploy up` so CFN, management and Demo CE
use current images with compatible registration fields.

The config file is [`demo-ce/config/config.json`](demo-ce/config/config.json), a generic
starter mounted read-only at `/etc/demo-ce/config.json` through `CE_CONFIG_FILE`.
Before use, replace `replace-with-your-mas-id` with the id of your MAS and the
example identities (`my-agent`, `my-tool`, `my-llm`) with those your MAS submits.
A MAS that is not listed in the file is denied. To use your own file, set
`DEMO_CE_CONFIG_FILE` in `.env`; relative paths resolve from `deploy/`.
`make -C deploy up` checks that the file exists before starting services.

Other settings: `CF_DEMO_CE_TAG` (image tag), `DEMO_CE_NAME` (name in CFN),
`DEMO_CE_LOG_FORMAT` (`console` or `json`), `LOG_LEVEL`, and `NO_COLOR`.
`CE_CONTEXT_WAIT`, `CE_CONTEXT_ATTEMPTS`, and `CE_CONTEXT_RETRY_WAIT` control
context retries. Evidence is selected per content rule in the JSON file.
The CE uses `http://ioc-analytics-api:8000` for runtime context and Cognition Store access.
Its `OXP_API_URL` environment variable retains the name supported by the CE image.
Pre-call events can also be published to `http://ioc-scale-cf-demo-ce:18000/events`
from the Compose network (or `http://localhost:18000/events` from the host).
See the [Demo CE configuration reference](../samples/docs-site/content/demo-ce/configuration.md)
for the file format.

### Enforcement (optional)

[`enforcement/`](enforcement/) holds two optional flavors, `envoy` (Envoy with the
Go sidecar and Wasm filters) and `shadi` (the sender-authorization verifier), each
with an overlay compose file and example configs. They are not part of the base
stack; start one with `make -C deploy up enforcement=envoy` or `enforcement=shadi`. Setup
for each is in [`enforcement/README.md`](enforcement/README.md).

## Services

| Service | Port | Description |
|---------|------|-------------|
| `ioc-scale-db` | 5456 | AgensGraph + pgvector + TimescaleDB database. Built from [`docker-db/`](docker-db/) in this repo. Hosts `cfn_mgmt`, `cognition_store` and `cfn_audit` |
| `ioc-scale-cf-mgmt-svc` | 9000 | Management backend API |
| `ioc-scale-cf-mgmt-plane-ui` | 9001 | Management plane UI (Next.js) |
| `ioc-scale-cfn-svc` | 9002 (HTTP), 9003 (gRPC) | Cognition Fabric Node |
| `ioc-scale-cf-demo-ce` | 18001 (gRPC), 18000 (HTTP), loopback only | Go Demo CE with JSON configuration; default. See [Demo CE](#demo-ce) |
| `ioc-scale-enforcement-proxy-mediation` | 9006 (gRPC), 9005 (HTTP) | Enforcement proxy mediation core. Audit destination is CFN; no internal database configured. Bound to 127.0.0.1 |

### SCOPE infrastructure

| Service | Port | Description |
|---------|------|-------------|
| `rabbitmq` | 5672 (AMQP), 15672 (management UI) | Message broker for the worker pipeline |
| `neo4j` | 7474 (HTTP), 7687 (Bolt) | Knowledge graph store |
| `clickhouse-server` | 8123 (HTTP), 9009 (native TCP) | Raw telemetry store the workers read sessions from |
| `otel-collector` | 4317 (OTLP gRPC), 4318 (OTLP HTTP) | Receives spans from instrumented apps and writes them to ClickHouse |
| `ioc-analytics-api` | 8081 | SCOPE API with Cognition Fabric endpoints enabled and caching disabled |
| `event-exporter` | 4417 (OTLP gRPC) | Receives runtime-event logs and delivers configured callback notifications |

Unlike SCOPE's standalone integration, this deployment keeps bundled ClickHouse
and the OTel Collector rather than requiring an external telemetry store.
The API continues using the bundled `cognition_store` PostgreSQL database.
No Redis cache or background enrichment containers are needed.

Send runtime-event logs directly to `localhost:4417` from the host or
`event-exporter:4417` on the Compose network. The collector's existing ClickHouse
pipelines are unchanged; it does not forward logs to the exporter automatically.
Notification rules in [`event-exporter-config.yaml`](event-exporter-config.yaml)
are opt-in (`rules: []`). Add filter expressions and reachable callback URLs,
or set `EVENT_EXPORTER_CONFIG_FILE` to a custom rules file.

ClickHouse publishes its native port on host `9009` rather than `9000`, which
already belongs to `ioc-scale-cf-mgmt-svc`. Inside the compose network it is
still reached on `9000`, which is what
[`otel-collector-config.yaml`](otel-collector-config.yaml) points at.

Point an instrumented application at `http://localhost:4318` (or
`http://otel-collector:4318` from inside the network) to get its traces into
the pipeline.

#### Connecting ClickHouse to the workers

The collector writes spans, but it does not know about the columns the workers
read or about RabbitMQ. Two one-shot services configure that connection on
startup. `scope-clickhouse-init` waits five seconds, adds the materialized trace
columns, and creates the RabbitMQ-backed view. `scope-rabbitmq-init` then binds
the `claris` exchange to the `new_session_in` queue declared by `norm`.

The operations are idempotent and run automatically with `docker compose up`.
The `claris` exchange and worker-internal `/claris` paths are still used by the
upstream SCOPE image and must not be renamed.
Set `SCOPE_INIT_DELAY_SECONDS` to change the initial grace period. See
[`scripts/README.md`](scripts/README.md) for verification and recovery commands.

### SCOPE worker

The normalization worker exposes no ports and receives sessions over RabbitMQ.

| Service | Description |
|---------|-------------|
| `norm` | Normalization; pipeline entry point |

### MAS sample app

| Service | Port | Description |
|---------|------|-------------|
| `noa-trip-planner` | 8125 | Multi-agent trip planner that emits OTLP spans into the collector |

Nothing in the stack produces traces on its own, so without this there is
nothing for the workers to process. It is started
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

See the root [`.env.example`](../.env.example) for all available configuration options. Key settings:

- `IOC_SCALE_DB_*` - Database credentials
- `ADMIN_USER_PASSWORD` - Admin password for mgmt backend
- `BFF_GRPC_PORT`, `BFF_HTTP_PORT` - Host ports (bound to 127.0.0.1) for
  `ioc-scale-enforcement-proxy-mediation`. The defaults are `9006` (gRPC) and `9005` (HTTP), chosen so they do not
  clash with `ioc-analytics-api` (host `8081`) or the enforcement proxy's own compose
  (`8082`, `18083`).
- `BFF_GRPC_ALLOW_INSECURE_LOCAL` - Defaults to `true` so the core starts without
  mTLS. Local development only; set it to `false` and configure TLS elsewhere.
- Audit persistence in `ioc-scale-enforcement-proxy-mediation` is fixed to `AUDIT_PERSISTENCE_MODE_CFN`
  at startup in Compose. CFN audit ingestion is not implemented yet, so this mode
  currently stores no new audit records.
- `CF_ENFORCEMENT_ADDRESS`, `CF_ENFORCEMENT_TIMEOUT`, `CF_ENFORCEMENT_ALLOW_PLAINTEXT` -
  CFN gRPC connection settings passed to mediation and enforcement adapters.
  Defaults are `ioc-scale-cfn-svc:9003`, `2s` and `true` for the local stack.
- `CF_REGISTRY`, `*_TAG` - Source and version of the CF service images (see above)
- `PROXY_REGISTRY`, `ENFORCEMENT_*_TAG` - Source and version of the enforcement images
- `SCOPE_REGISTRY`, `SCOPE_IMG_TAG`, `SCOPE_API_IMG_TAG`,
  `SCOPE_EVENT_EXPORTER_IMG_TAG` - Source and version of the SCOPE images
- `SCOPE_API_IMAGE` - Optional full API image reference
- `SCOPE_ENABLE_COGNITION_FABRIC_ENDPOINTS` - Defaults to `true`
- `EVENT_EXPORTER_CONFIG_FILE` - Notification rules file, relative to `deploy/`
- `OPENAI_API_KEY` - Optional LLM credentials for on-demand API metrics
- `AI_GATEWAY_API_KEY`, `AI_GATEWAY_BASE_URL` - Credentials and endpoint for NOA
- `CLICKHOUSE_*` - Read by the workers and the OTel collector. `CLICKHOUSE_HOST`
  defaults to the bundled `clickhouse-server`; set it to `host.docker.internal`
  to use an external instance instead.
- `NEO4J_PASSWORD` - Shared by `neo4j`, `ioc-analytics-api` and `norm`; defaults to
  `testpassword` when unset. `NEO4J_USERNAME` (default `neo4j`) is shared the same way.
- `SCOPE_POSTGRES_DB` - Cognition Store database, defaults to `cognition_store`
- `SCOPE_INIT_DELAY_SECONDS` - Grace period before automatic ClickHouse/RabbitMQ
  bridge initialization starts. Defaults to 5 seconds.
- `NOA_*` - The sample app. It reuses `AI_GATEWAY_BASE_URL` and
  `AI_GATEWAY_API_KEY`, so that key needs the chat model on its allow-list too.
  `NOA_API_PORT` moves the host port only; the app always listens on 8125 inside
  the container. `NOA_ENABLE_SIMULATED_DELAY` and the `NOA_DELAY_*` values pad
  out a session when you want a slower one to watch.

### Architecture

Platform is set per service through the environment, because the images differ:

- `SCOPE_WORKER_PLATFORM` (default `linux/amd64`) - API, normalization worker
  and legacy NOA image.
- `SCOPE_INFRA_PLATFORM` (default `linux/arm64`) - RabbitMQ, Neo4j, ClickHouse
  and the OTel collector. These must
  match the host architecture; RabbitMQ's Erlang runtime crashes during
  feature-flag setup when emulated. Set to `linux/amd64` on an Intel/AMD host.

## Access

Pulling the SCOPE images requires access to the `ioc-project` GHCR packages.
Legacy NOA and enforcement images still use `cisco-eti` packages:

```bash
echo "$GITHUB_TOKEN" | docker login ghcr.io -u "$GITHUB_USERNAME" --password-stdin
```

# CF deployment and local source workflow

The sibling [`ioc-scale-cf-deployment`](https://github.com/cisco-eti/ioc-scale-cf-deployment)
repository supplies the shared Compose stack. This guide covers both its
published-image setup and the CF source workflow maintained in this repository.
Commands in the published-image section run from the deployment checkout;
local source commands run from `ioc-scale-cfn-svc` unless stated otherwise.

## Published-image stack

Run these steps from the sibling `ioc-scale-cf-deployment` checkout.

1. Check out [the deployment repository](https://github.com/cisco-eti/ioc-scale-cf-deployment).
2. Copy the environment template if `.env` does not already exist.
   An existing `.env` may be a link to the CFN checkout from the source workflow;
   keep it when switching modes.

   ```bash
   cp -n .env.example .env
   ```

   Set `OPENAI_API_KEY` and `AI_GATEWAY_API_KEY` in `.env` to a working gateway
   key. The same value can be used for both if it has access to the selected
   chat and embedding models. The other passwords in `.env.example` are already
   populated for a local run. Configure the gateway URL, model aliases, and
   platform settings described below as needed.

3. [Authenticate to GHCR](#container-registry-access) before pulling the private images.
4. Start the stack, with or without the NOA sample application:

   ```bash
   docker compose up -d
   docker compose --profile full-mas up -d   # adds the NOA sample app
   ```

   The services use published images; no OXP source checkout or Artifactory
   build is needed. `ioc-scale-db-init`, `oxp-clickhouse-init`, and
   `oxp-rabbitmq-init` exit successfully after setup. `oxp-api` uses the image
   pinned in Compose unless `OXP_API_IMAGE` is set; OXP workers use
   `OXP_REGISTRY` and `OXP_IMG_TAG`.

The deployment repository builds the database image. See its
[`docker-db/`](https://github.com/cisco-eti/ioc-scale-cf-deployment/tree/main/docker-db)
for the Dockerfile and publishing instructions.

## Container registry access

Pulling the published images requires access to the `cisco-eti` GHCR packages:

```bash
echo "$GITHUB_TOKEN" | docker login ghcr.io -u "$GITHUB_USERNAME" --password-stdin
```

## Shared stack configuration

For source mode, use this repository's [`.env.example`](../.env.example).
For published mode, use the [deployment template](https://github.com/cisco-eti/ioc-scale-cf-deployment/blob/main/.env.example).
Key settings:

- `IOC_SCALE_DB_*` - Database credentials
- `ADMIN_USER_PASSWORD` - Admin password for mgmt backend
- `OXP_REGISTRY`, `OXP_IMG_TAG` - Source and version of OXP worker images
- `OXP_API_IMAGE` - Optional override for the OXP API image pinned in Compose
- `AI_GATEWAY_API_KEY`, `OPENAI_API_KEY` - Required by `embedding`, `mce`, and
  `analysis`. Without them those workers exit on startup and restart in a loop.
  The two are read by different workers and can hold the same gateway key.
- `AI_GATEWAY_BASE_URL` - Endpoint the `embedding` worker calls. Set it when
  using a gateway; it otherwise defaults to `https://api.openai.com/v1`.
- `CLICKHOUSE_*` - Read by the workers and the OTel collector. `CLICKHOUSE_HOST`
  defaults to the bundled `clickhouse-server`; set it to `host.docker.internal`
  to use an external instance instead.
- `NEO4J_PASSWORD` - Shared by `neo4j` and `oxp-api`; defaults to
  `testpassword` when unset.
- `OXP_INIT_DELAY_SECONDS` - Grace period before automatic ClickHouse/RabbitMQ
  bridge initialization starts. Defaults to 5 seconds.
- `NOA_*` - The sample app. It reuses `AI_GATEWAY_BASE_URL` and
  `AI_GATEWAY_API_KEY`, so that key needs the chat model on its allow-list too.
  For the published container, `NOA_API_PORT` moves the host port only;
  the app listens on 8125 inside. In source mode, it sets the local server port.
  `NOA_ENABLE_SIMULATED_DELAY` and the `NOA_DELAY_*` values pad
  out a session when you want a slower one to watch.

### AI gateway

For an OpenAI-compatible LiteLLM gateway, use the gateway base URL ending in
`/v1`, without `/chat/completions`. Set both keys to a gateway credential with
access to the selected chat and embedding models. For example:

```dotenv
OPENAI_API_KEY=<gateway-key>
AI_GATEWAY_API_KEY=<same-gateway-key>
AI_GATEWAY_BASE_URL=https://<gateway-host>/v1
LLM_BASE_MODEL_URL_MCE=https://<gateway-host>/v1
NOA_LLM_MODEL=azure/gpt-5-mini
LLM_MODEL_NAME=azure/gpt-5-mini
EMBEDDING_MODEL=azure/text-embedding-3-small
```

Use the model aliases enabled for your key. A successful chat request does not
establish that the embedding model is available to the same key.

If company TLS inspection causes `APIConnectionError`, use a PEM bundle with
the normal trusted roots and the company root CA. Mount it into the
published NOA container and OXP workers that call the gateway, and set
`SSL_CERT_FILE` to its container path.
In the deployment checkout, save this local override as `compose.ca.local.yml`:

```yaml
services:
  noa-trip-planner:
    volumes:
      - ${IOC_CA_BUNDLE}:/etc/ssl/certs/ioc-ca-bundle.pem:ro
    environment:
      SSL_CERT_FILE: /etc/ssl/certs/ioc-ca-bundle.pem
```

Set `IOC_CA_BUNDLE` to the absolute path of your PEM file, apply the same mount
and environment setting to any affected OXP worker, then run from the
deployment checkout:

```bash
docker compose -f docker-compose.yml -f compose.ca.local.yml \
  --profile full-mas up -d --no-build
```

Keep local certificate paths out of the shared template.

### Container platforms

Platform is set per service through the environment, because the images differ:

- `DOCKER_DEFAULT_PLATFORM` (set to `linux/amd64` in both templates) - the
  platform requested by the CF, UI, and database services that reference it.
- `CLARIS_WORKER_PLATFORM` (default `linux/amd64`) - the worker images are
  published for amd64 only.
- `OXP_INFRA_PLATFORM` (default `linux/arm64`) - RabbitMQ, Neo4j, ClickHouse,
  Redis, and the OTel collector. These must match the host architecture;
  RabbitMQ's Erlang runtime crashes during feature-flag setup when emulated.
  Set to `linux/amd64` on an Intel/AMD host.

On Apple Silicon, the current setup runs the CF and worker images as amd64 and
the OXP infrastructure as arm64. The published OXP API image also uses
`CLARIS_WORKER_PLATFORM`.

## CF source workflow: checkout and prerequisites

Clone these repositories as siblings:

```text
ioc-cfn/
├── ioc-scale-cfn-svc/          # this repository; .env and deploy/local/noa-trip-planner/
├── ioc-scale-cf-deployment/    # Compose stack
├── ioc-scale-cf-mgmt-svc/
├── ioc-scale-cf-ui/
└── ioc-scale-cf-demo-ce/
```

Install Docker Compose v2, [Task](https://taskfile.dev/), Go 1.25+, Python
3.10+, Poetry, [uv](https://docs.astral.sh/uv/), Node.js 20.9+ (Node 20
recommended), and npm. Create the CFN root `.env` from this repository's
[`.env.example`](../.env.example) and configure the gateway keys:

```bash
cp -n .env.example .env
```

The local tasks read this CFN `.env`. Because the deployment Compose file also
loads `.env` relative to its own directory, the first task creates an ignored
`../ioc-scale-cf-deployment/.env` symlink to this file if none exists. If a
separate deployment `.env` already exists with different contents, the task
stops so the two configurations cannot silently diverge. The service-only
[`.env.sample`](../.env.sample) is insufficient for the full local stack.

For management on macOS, select a compatible Python before installing:

```bash
uv python install 3.13
uv tool install poetry
(cd ../ioc-scale-cf-mgmt-svc && poetry env use "$(uv python find 3.13)")
```

Make sure `~/.local/bin` is on your `PATH`. The UI checkout has a `.nvmrc`
for Node 20. If using nvm, select Node 20 in the UI terminal before `npm ci`
and `task run:cf-ui`.

Install source dependencies once:

```bash
(cd ../ioc-scale-cf-mgmt-svc && poetry install)
go mod download
(cd ../ioc-scale-cf-ui && npm ci)
(cd ../ioc-scale-cf-demo-ce/demo-ce && uv sync --frozen)
(cd deploy/local/noa-trip-planner && uv sync --frozen) # optional source MAS
```

## Start CF services from source

From this CFN repository:

```bash
task infra:up
(cd ../ioc-scale-cf-deployment && docker compose stop ioc-scale-cf-mgmt-svc ioc-scale-cf-mgmt-plane-ui ioc-scale-cfn-svc ioc-scale-cf-demo-ce)
```

`infra:up` starts the shared Postgres and OXP services through the deployment
Compose project. It leaves published CF containers alone; stopping those
containers explicitly frees the host ports. The tasks report missing sibling
checkouts and refuse to run local CF processes while published CF containers
are still running.

Open four terminals in this CFN repository and run one foreground task per
terminal, in order:

1. `task run:cfn-mgmt` — management on port 9000; applies migrations.
2. `task run:cfn` — CFN HTTP 9002 and gRPC 9003.
3. `task run:cf-ui` — management UI on 9001.
4. `task run:demo-ce` — demo CE gRPC on 50051.

Wait for each service before starting the next. Logs for source processes are
in their respective terminals; Compose logs remain in the deployment project.
The management task rejects a management checkout `.env`, because it can
override the local database target.

`infra:up` creates `cfn_mgmt_local` and `cfn_audit_local` in the shared
Postgres server on `${IOC_SCALE_DB_PORT:-5456}`. These are separate from the
published CF databases `cfn_mgmt` and `cfn_audit`. Both modes share OXP and
its data stores. Create a MAS and associate the demo CE in the local
management UI before calling `GetDisposition`.

## Management UI bootstrap

Open <http://localhost:9001> and sign in as `admin` with the
`ADMIN_USER_PASSWORD` set in the active mode's `.env`. Select the default
workspace, open **Multi-Agentic Systems**, and create a MAS. Add its agents in the **Agents**
section. The demo CE registers itself with CFN; once it appears online, select
it in the MAS **Cognition Engines** section or use **Associate** on the MAS
details page. Keep the MAS ID from the details page for management and findings
queries. OTLP telemetry ingestion only needs the collector endpoint; MAS
registration and CE association are management configuration.

## Cognition Store findings

Query findings for a registered MAS ID, quoting the URL so `zsh` does not
interpret `?` as a filename wildcard:

```bash
curl 'http://localhost:8081/api/v1/cognition-store/findings?mas_id=YOUR_MAS_ID'
```

Replace `YOUR_MAS_ID` with the ID shown on the MAS details page.

This endpoint returns stored CE findings, not raw traces or metrics. An empty
`findings` array is expected until a CE evaluation or explicit API write stores
one. `context_complete: true` means fewer findings were returned than the
requested limit (100 by default); it does not assert that the MAS telemetry or
decision context is complete.

## Optional NOA sample

Use either the published NOA container or the CF-owned source copy:

```bash
task run:full-mas                  # published NOA container (default)
NOA_MODE=source task run:full-mas  # source NOA with direct CFN enforcement call
```

Both commands run in the foreground and show NOA logs in that terminal.
The published image emits telemetry but does not route its protected traffic
through the enforcement proxy in this Compose stack. Source mode runs
[`deploy/local/noa-trip-planner/`](local/noa-trip-planner/), serves `/ask` on
`${NOA_API_PORT:-8125}`, and exports telemetry to the shared collector at
`localhost:4318`. Its direct `GetDisposition` call holds each proposed tool
invocation; it simulates the proxy decision path, not network proxy integration.

Set `NOA_MAS_ID` in this repository's `.env` to the MAS ID from the
local management UI. Source mode uses the same value as the Observe application
ID. `NOA_ENFORCEMENT_TIMEOUT_SEC` defaults to 10 seconds; an RPC error or
timeout blocks the tool. Stop any published NOA container before source mode:

```bash
(cd ../ioc-scale-cf-deployment && docker compose --profile full-mas stop noa-trip-planner)
```

Set `DEMO_CE_DECISION=allow` (default) or `DEMO_CE_DECISION=deny` in the
CFN `.env`, then restart `task run:demo-ce` to change the
forced verdict. A DENY skips the selected tool and the local adapter returns
an error to the agent. This demo CE still reads and writes OXP findings, but
its forced verdict does not inspect the tool arguments. The published demo CE
image may continue to return ALLOW.

Ask it something once the stack is up:

```bash
curl -X POST http://localhost:8125/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"Plan a 1-day trip to Celestia"}'
```

The session only reaches Neo4j after the app emits its `session.end` span,
which the SDK sends on a five-minute idle timeout or at exit.

## Checks and shutdown

With source dependencies installed and `task infra:up` running:

```bash
task test   # management, CFN, and demo CE tests
task check  # Compose config, formatting, lint, types, then tests
```

`task test` uses the dedicated `ioc_test` database; management tests can reset
its tables. It does not use `cfn_mgmt_local` or the published management DB.
The UI and deployment repositories currently have no unit-test suite.
`task check` performs management Black/Flake8, CFN gofmt/vet, and UI
ESLint/Prettier/TypeScript checks before the same tests. The tasks do not
reformat source code.

Stop the foreground processes with Ctrl+C. To stop shared infrastructure
without deleting volumes, run `task infra:down`. To return to published CF
containers while keeping infrastructure up, run from the deployment checkout:

```bash
docker compose up -d --no-build
```

# Run Cognition Fabric locally from source

This workflow runs the CF management service, CFN, management UI, and demo CE
from sibling source checkouts. The
[`ioc-scale-cf-deployment`](https://github.com/cisco-eti/ioc-scale-cf-deployment)
Compose project supplies Postgres, OXP, and their supporting services as
published containers. You do not need OXP source code. Run the commands below
from `ioc-scale-cfn-svc` unless a command changes directory explicitly. For an
all-container deployment, use the deployment repository's README.

## Clone the workspace

Clone these five repositories into the same parent directory. You can name and
place that parent directory as you like; the sibling directory names matter.

```bash
mkdir ioc-cfn
cd ioc-cfn
git clone git@github.com:cisco-eti/ioc-scale-cfn-svc.git
git clone git@github.com:cisco-eti/ioc-scale-cf-deployment.git
git clone git@github.com:cisco-eti/ioc-scale-cf-mgmt-svc.git
git clone git@github.com:cisco-eti/ioc-scale-cf-ui.git
git clone git@github.com:cisco-eti/ioc-scale-cf-demo-ce.git
cd ioc-scale-cfn-svc
```

Open `ioc-scale-cfn-svc/ioc-cfn.code-workspace` in VS Code or Cursor. The
workspace uses relative paths to the sibling checkouts. If you already cloned
CFN, clone the other four repositories beside it. The workspace's `.agents`
and reference OXP folders are optional for running the stack; they may appear
as missing folders until you add them. The sample MAS source used below is
already in `deploy/local/noa-trip-planner/`.

## Prerequisites and configuration

Install Docker with Compose v2, [Task](https://taskfile.dev/), Go 1.25+, Python
3.10+, Poetry, [uv](https://docs.astral.sh/uv/), Node.js 20 (at least
20.9), and npm. The demo CE needs Python 3.11+. The management service
and demo CE use their own Python environments.

Start Docker, then authenticate to the private `cisco-eti` images in GHCR.
Set `GITHUB_USERNAME` and `GITHUB_TOKEN` to an account and token with package
read access:

```bash
echo "$GITHUB_TOKEN" | docker login ghcr.io -u "$GITHUB_USERNAME" --password-stdin
```

Create the CFN repository's `.env` and set the two gateway keys. They may use
the same credential when it can access both the chat and embedding models.
Set the gateway URLs and model aliases to those available to your credential:

```bash
cp .env.example .env
```

```dotenv
OPENAI_API_KEY=<gateway-key>
AI_GATEWAY_API_KEY=<gateway-key>
AI_GATEWAY_BASE_URL=https://<gateway-host>/v1
LLM_BASE_MODEL_URL_MCE=https://<gateway-host>/v1
NOA_LLM_MODEL=<chat-model-alias>
LLM_MODEL_NAME=<chat-model-alias>
EMBEDDING_MODEL=<embedding-model-alias>
```

Use the base URL ending in `/v1`, without `/chat/completions`. The example
passwords in `.env.example` are populated for a local run. If the gateway and
models remain mismatched, OXP workers or the sample MAS can fail even while the
other services start. `.env.sample` only covers CFN alone and is insufficient
for this workflow.

The tasks load the CFN `.env`. On first use, they create an ignored
`../ioc-scale-cf-deployment/.env` symlink to it for Compose. If the deployment
checkout already has a different `.env`, a task stops with an error: reconcile
the two configurations or point the deployment `.env` at the CFN one.

On Apple Silicon, the template runs OXP infrastructure as arm64 while the
published OXP workers and database image use amd64. On an Intel/AMD host, set
`OXP_INFRA_PLATFORM=linux/amd64` in `.env`. See `.env.example` for the other
platform settings.

For management on macOS, select a compatible Python before installing its
dependencies:

```bash
uv python install 3.13
uv tool install poetry
(cd ../ioc-scale-cf-mgmt-svc && poetry env use "$(uv python find 3.13)")
```

Make sure `~/.local/bin` is on your `PATH`. The UI repository has a `.nvmrc`
for Node 20. If you use nvm, run `nvm use 20` before `npm ci` and in the UI
terminal before `task run:cf-ui`.

Install source dependencies once:

```bash
(cd ../ioc-scale-cf-mgmt-svc && poetry install)
go mod download
(cd ../ioc-scale-cf-ui && npm ci)
(cd ../ioc-scale-cf-demo-ce/demo-ce && uv sync --frozen)
(cd deploy/local/noa-trip-planner && uv sync --frozen) # only for source MAS
```

## Start the shared infrastructure and CF services

From the CFN checkout, start Postgres and OXP through the deployment Compose
project:

```bash
task infra:up
```

If you previously started the published CF containers, stop them before
running CF services from source. A fresh checkout does not need this step:

```bash
(cd ../ioc-scale-cf-deployment && docker compose stop \
  ioc-scale-cf-mgmt-svc ioc-scale-cf-mgmt-plane-ui \
  ioc-scale-cfn-svc ioc-scale-cf-demo-ce)
```

`infra:up` creates `cfn_mgmt_local` and `cfn_audit_local` in the shared Postgres
server. They are separate from the published CF databases. Both modes use the
same OXP services and data stores. `infra:up` leaves published CF containers
alone; each `run:*` task refuses to start while one is running. Tasks check
required sibling checkouts and report their clone URLs if any are missing.

Run each of these **foreground** tasks in a separate CFN checkout terminal.
Start them in order, waiting for each service to become ready:

1. `task run:cfn-mgmt` — management API on port 9000; applies local database migrations.
2. `task run:cfn` — CFN HTTP on 9002 and gRPC on 9003.
3. `task run:cf-ui` — management UI on 9001.
4. `task run:demo-ce` — demo CE gRPC on 50051.

The management task refuses to run if the management checkout has its own
`.env`, which could override the local database target. Logs from these four
services appear in their terminals. To save a source service log while it
runs, use `set -o pipefail; task run:cfn 2>&1 | tee /private/tmp/cfn.log` in
its terminal. To follow infrastructure logs, run this from the deployment
checkout in another terminal:

```bash
docker compose logs -f --tail=100 oxp-api otel-collector ioc-scale-db
```

## Exercise enforcement with the sample MAS

The CF services can start without a MAS. To route a sample `GetDisposition`
request to the demo CE, register a MAS and associate that CE first.

Open <http://localhost:9001> and sign in as `admin` using
`ADMIN_USER_PASSWORD` from the CFN `.env`. In the default workspace, create a
Multi-Agentic System, add its agents, and associate the demo CE after it
registers and appears online. Copy the MAS ID from its details page.

Stop a previously running published NOA container first, then set
`NOA_MAS_ID` to the new MAS ID in the CFN `.env` and start the CF-owned source
copy in a fifth terminal:

```bash
(cd ../ioc-scale-cf-deployment && docker compose --profile full-mas stop noa-trip-planner)
NOA_MODE=source task run:full-mas
```

The source sample serves `/ask` on `${NOA_API_PORT:-8125}` and emits telemetry
to the OTel collector on `localhost:4318`. Before each proposed tool call it
sends `GetDisposition` to the local CFN and waits for a response. This direct
call simulates the enforcement proxy decision path; it is not network proxy
integration. The published sample image does not exercise this direct path.

```bash
curl -X POST http://localhost:8125/ask \
  -H 'Content-Type: application/json' \
  -d '{"question":"Plan a 1-day trip to Celestia, do not ask follow-up questions"}'
```

Set `DEMO_CE_DECISION=allow` (default) or `DEMO_CE_DECISION=deny` in the CFN
`.env` and restart `task run:demo-ce` to change the forced verdict. A DENY
skips the selected tool and returns an error to the sample agent. This demo CE
reads and writes OXP findings, but the forced verdict does not inspect tool
arguments. If the CE is unavailable, the sample adapter treats the gRPC error
or timeout as an unavailable tool. See the
[sample's README](local/noa-trip-planner/README.md) for its enforcement
behavior.

To inspect stored findings for the MAS, quote the URL so the shell does not
interpret `?`:

```bash
curl 'http://localhost:8081/api/v1/cognition-store/findings?mas_id=YOUR_MAS_ID'
```

An empty `findings` array is normal until a CE evaluation stores a finding.
`context_complete: true` only describes pagination of this response; it does
not mean telemetry or decision context is complete.

## Checks and shutdown

With source dependencies installed and `task infra:up` running:

```bash
task test   # management, CFN, and demo CE tests
task check  # Compose configuration, formatting, lint, types, then tests
```

`task test` uses a dedicated `ioc_test` database and can reset its tables. It
does not use the local management or published management database.
`task check` does not reformat source files.

Stop foreground source services with Ctrl+C. Stop the shared infrastructure
without deleting its volumes with `task infra:down`. For the all-container
workflow, follow the deployment repository's README.

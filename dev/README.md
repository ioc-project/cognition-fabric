# Run Cognition Fabric locally from source

This workflow runs the CF management service, CFN, management UI, and template CE
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
20.9), and npm. The template CE needs Python 3.11+. The management service
and template CE use their own Python environments.
The optional Go demo CE requires Go 1.25.9+ (or automatic Go toolchain downloads).

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

The tasks load the CFN `.env` and pass it explicitly to Compose. They do not
create or modify files in the deployment checkout. An existing deployment
`.env` symlink can remain, but is not required by these tasks.

Select both the NOA implementation and its enforcement mode in the CFN `.env`:

```dotenv
NOA_MODE=source
NOA_ENFORCEMENT_MODE=direct
```

`NOA_MODE` accepts `source` (the default) or `published`.
`NOA_ENFORCEMENT_MODE` accepts `direct` (the default) or `proxy`. Proxy mode
requires source NOA. Both `infra:up` and `run:full-mas` read these settings;
no inline environment assignments are needed. The published image is independent
and does not gain the source adapter's direct enforcement behavior.

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
(cd ../ioc-scale-cf-demo-ce/template-ce && uv sync --frozen)
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

In proxy mode, `infra:up` also starts Envoy, its plugin installer jobs, and
the mediation service used for proxy audit records. It does not start published
CF containers or require the source CFN or NOA to be running. The source NOA
task applies the MAS-specific proxy routes when the MAS ID is available.

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
4. `task run:template-ce` — template CE gRPC on 50051, health on 8082, notifications on 8080.

The open audit panel refreshes automatically every 30 seconds while the browser
tab is visible and online. Configure `CFN_UI_AUDIT_REFRESH_INTERVAL_SECONDS` in
the CFN `.env`; `0` disables auto-refresh. Restart `task run:cf-ui` and reload the
browser page after changing this setting.

`CFN_UI_AUDIT_FLASH_DURATION_SECONDS=60` controls how long a trace header pulses
after auto-refresh finds a new audit item (`0` disables flashing). Set it in the
same CFN `.env`, restart `task run:cf-ui` and reload the browser. Each trace has its
own duration, restarted by another incoming item; multiple headers can flash
together, including collapsed groups. Initial loads and Load more stay quiet.

The template CE runs separate health and notification HTTP servers. The local task
sets `HEALTH_PORT=8082` and `HTTP_PORT=8080` to keep their listeners and advertised
registration addresses aligned; both servers otherwise default to port 8080.
It synchronizes runtime dependencies from the template CE's lockfile on startup,
preserving installed extras, so pulling new dependencies does not leave a stale
virtual environment. CFN probes the health endpoint; the CE does not send heartbeats.

For the policy-driven Go CE instead of the Python template CE, use
`task run:demo-ce` in step 4 after configuring its policy as described below.

### Choose NOA enforcement and CE independently

For all four combinations, set `NOA_MODE=source` in the CFN `.env`:

| `NOA_ENFORCEMENT_MODE` | CE task (choose one) | Tool authorization path |
| --- | --- | --- |
| `direct` | `task run:template-ce` | NOA → CFN → template CE |
| `direct` | `task run:demo-ce` | NOA → CFN → demo CE |
| `proxy` | `task run:template-ce` | NOA → Envoy → CFN → template CE |
| `proxy` | `task run:demo-ce` | NOA → Envoy → CFN → demo CE |

`direct` means the proxy is bypassed; CFN authorization still runs. In proxy
mode, start Envoy with `task infra:up` before `task run:full-mas`. The latter
starts the HTTP tool service automatically. Both CE tasks use the same local
CFN and OXP, regardless of the NOA mode. Template CE uses gRPC 50051, health 8082,
and notifications 8080; demo CE uses gRPC 18001 and HTTP 18000. These do not
overlap the default NOA API/tool ports (8125/8126) or Envoy port (9010).

To switch CEs, stop the previous CE task, disable its record in the management
UI, and start the chosen CE task. Associate it with your MAS and ensure that
it is enabled and online. Re-enable an existing CE record if it was disabled
during a previous switch. CFN selects the first eligible CASA CE; merely
starting a different CE does not change the MAS's associations or select it.
The demo CE also requires `CE_CONFIG_FILE` and a policy for `NOA_MAS_ID`;
the template CE uses `TEMPLATE_CE_DECISION=allow` or `deny`.

To switch NOA modes, stop `task run:full-mas`, change the setting, and restart
it (run `task infra:up` first when selecting proxy). A proxy left running in
direct mode is unused. The CE task does not need to change when NOA mode changes.

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
request to the template CE, register a MAS and associate that CE first.

Open <http://localhost:9001> and sign in as `admin` using
`ADMIN_USER_PASSWORD` from the CFN `.env`. In the default workspace, create a
Multi-Agentic System, add its agents, and associate the template CE after it
registers and appears online. Copy the MAS ID from its details page.

Stop a previously running published NOA container first, then set
`NOA_MAS_ID` to the new MAS ID and `NOA_MODE=source` in the CFN `.env`, and
start the CF-owned source copy in a fifth terminal:

```bash
(cd ../ioc-scale-cf-deployment && docker compose --profile full-mas stop noa-trip-planner)
task run:full-mas
```

The source sample serves `/ask` on `${NOA_API_PORT:-8125}` and emits telemetry
to the OTel collector on `localhost:4318`. In direct mode, before each proposed
tool call it sends `GetDisposition` to the local CFN and waits for a response.
This direct call simulates the enforcement proxy decision path. Proxy mode
uses an actual HTTP interception boundary, described below. The published sample
image does not exercise the source adapter's enforcement paths.

```bash
curl -X POST http://localhost:8125/ask \
  -H 'Content-Type: application/json' \
  -d '{"question":"Plan a 1-day trip to Celestia, do not ask follow-up questions"}'
```

Set `TEMPLATE_CE_DECISION=allow` (default) or `TEMPLATE_CE_DECISION=deny` in the CFN
`.env` and restart `task run:template-ce` to change the forced verdict. A DENY
skips the selected tool and returns an error to the sample agent. This template CE
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

## Use Envoy with source NOA

Set both modes in the CFN `.env`:

```dotenv
NOA_MODE=source
NOA_ENFORCEMENT_MODE=proxy
```

Run `task infra:up`, then start the source management service, CFN, UI, and
your CE as usual. Register the MAS and associate an enabled, online CE. Set
`NOA_MAS_ID` in `.env`, then run `task run:full-mas`.

The NOA task generates exact routes for that MAS and the existing NOA agent/tool
identities, reloads Envoy, starts its HTTP tool service, waits for it to become
ready, and starts NOA. Both source processes share its foreground terminal;
Ctrl+C stops both. No separate tool-service task is required.

```text
Source NOA -> Envoy :9010 -> source CFN :9003 -> associated CE
                |
                +-- ALLOW -> NOA tools :8126 -> result to NOA
                +-- blocked/unavailable -> tool error to NOA
```

Proxy mode sends each tool request once and does not call CFN directly or fall
back to local tool execution. The same proposed-call trace context is carried
in the HTTP request. Unknown paths are rejected. A generated local token allows
the host tool service to accept execution requests forwarded by Envoy; this
is local development configuration, not production workload authentication.

Envoy reaches the source CFN and tool service through Docker Desktop's
`host.docker.internal`. The tool listener defaults to `0.0.0.0:8126` so Docker
can reach it. The generated `noa_tools` cluster uses `dns_lookup_family: V4_ONLY`
to avoid selecting an IPv6 host address when Docker has no usable IPv6 route.
Proxy HTTP is exposed on host loopback port 9010. Use
`NOA_TOOLS_PORT`, `NOA_TOOLS_HOST`, and `ENVOY_HTTP_PORT` to change the local
ports/binding; `NOA_ENFORCEMENT_PROXY_URL`, when nonempty, overrides the client's
proxy origin. On Intel/AMD, set `ENFORCEMENT_PLATFORM=linux/amd64`. This workflow
uses POSIX process supervision and requires Docker-to-host connectivity; native
Linux may need its own `host.docker.internal` mapping.

Inspect proxy and mediation logs with `task proxy:logs`. The generated routes,
Envoy configuration, and local tool token live in ignored `tmp/enforcement/`.
The launcher reuses the deployment repo's published images and Compose overlay,
with a [CFN-owned override](local/enforcement/compose.override.yaml). It does not
write to the deployment repo or start the example echo upstream.

The current proxy uses HTTP 403 for both policy blocks and some fail-closed
availability errors. NOA reports a proxy block without inventing a CE denial
reason. Other transport failures produce an unavailable-tool error. A timeout
can happen after an upstream tool started, so failed requests are never retried
automatically. This mode exercises identity-based allow/block. OXP runtime-event
delivery and qualification of content rules remain separate integration work.

To switch back, stop NOA, set `NOA_ENFORCEMENT_MODE=direct`, and rerun
`task run:full-mas`. An already-running proxy can remain idle until
`task infra:down`. That task also stops the source proxy components even when
the setting has been changed back to direct, and preserves database volumes.

## Run the demo CE

`task run:demo-ce` runs the Go CE from the sibling
`ioc-scale-cf-demo-ce/demo-ce` checkout. It evaluates JSON identity and
content rules rather than returning the Python template CE's forced verdict.
Start infrastructure, management, and CFN as above, then prepare a local policy:

```bash
mkdir -p tmp
cp ../ioc-scale-cf-demo-ce/demo-ce/config/config.json tmp/config.json
```

Edit this copy: replace the sample `mas-a`/`mas-b` IDs with your actual MAS
IDs, and set source and destination IDs to those sent in `GetDisposition`.
Remove sample rules you do not need. Unlisted MAS IDs and unmatched routes
are denied. See the [demo CE README](../../ioc-scale-cf-demo-ce/demo-ce/README.md)
for the policy schema and content evidence requirements.

The repository's `tmp/` directory is ignored by Git. Set
`CE_CONFIG_FILE=tmp/config.json` in the CFN `.env` (as in `.env.example`), then run:

```bash
task run:demo-ce
```

Use `CE_CONFIG_FILE` for the Go demo CE configuration. Paths are absolute or
relative to the CFN checkout; existing config files can keep their filenames.
For the single-policy JSON form, also set `CE_MAS_FILE` to a file containing the actual MAS ID.
Restart the task after editing its policy or configuration.

The task builds against the sibling CFN checkout using temporary module files,
then runs in the foreground. It leaves both checkouts' `go.mod` and `go.sum`
unchanged. The first build may download the Go toolchain and public dependencies.
It uses CFN at `localhost:9002`, OXP at `localhost:8081`, gRPC at
`127.0.0.1:18001`, and HTTP at `127.0.0.1:18000`. CFN probes its `/healthz`;
registration supplies the base `health_url=http://127.0.0.1:18000` and separate
`health_endpoint=/healthz`, so the path is appended only once.
`/readyz` succeeds after registration. The CE supplies its registration defaults:
`demo-ce`, version `1.0.0`, and type `CASA`. The launcher forwards
`DEMO_CE_NAME` only when explicitly set. For the Python template CE, the
optional equivalent is `TEMPLATE_CE_NAME`; its own default is `template-ce`.

Stop `task run:template-ce` and disable its CE record in the management UI when
switching. Associate the demo CE with the MAS and ensure it is online and
enabled. CFN currently selects the first eligible CASA CE, so leaving both
eligible can route requests to the Python CE.

The source NOA sample can exercise identity rules. Its adapter does not publish
the pre-call events or session context required by some content rules; starting
this task alone does not provide that evidence. Use the demo CE's documented
evidence inputs when exercising content checks.

## Checks and shutdown

With source dependencies installed and `task infra:up` running:

```bash
task test   # management, CFN, and template CE tests
task check  # Compose configuration, formatting, lint, types, then tests
```

`task test` uses a dedicated `ioc_test` database and can reset its tables. It
does not use the local management or published management database.
`task check` does not reformat source files.

Stop foreground source services with Ctrl+C. Stop the shared infrastructure
without deleting its volumes with `task infra:down`. For the all-container
workflow, follow the deployment repository's README.

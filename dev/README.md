# Run Cognition Fabric locally

Run these commands from the `cognition-fabric` repository root. The local tasks
run CF components from this checkout and use the
[`ioc-scale-cf-deployment`](https://github.com/cisco-eti/ioc-scale-cf-deployment)
checkout configured by `CF_DEPLOYMENT_DIR` in root `.env` to start Postgres, OXP
and Enforcement Proxy infrastructure.
Deployment and OXP remain separate repositories; the tasks do not modify them.

## Fresh checkout

For the sibling-directory layout shown in `.env.example`, clone both repositories
into the same parent directory, then work from the monorepo root:

```bash
git clone https://github.com/cisco-eti/cognition-fabric.git
git clone https://github.com/cisco-eti/ioc-scale-cf-deployment.git
cd cognition-fabric
```

The Deployment checkout can be elsewhere; set its location in root `.env` as
described below.

Install dependencies and create `.env` as described below. First startup
initializes the local databases and registers the CF services.

## Layout and prerequisites

| Directory | Purpose |
|---|---|
| `api/` | Shared Go module, canonical protobufs and API contracts |
| `cfn/` | CFN Go service |
| `cf-mgmt/` | Python Management service |
| `cf-ui/` | Next.js Management UI |
| `samples/demo-ce/` | Go policy-driven CE |
| `samples/template-ce/` | Python CE with MAS notifications |
| `samples/noa-trip-planner/` | Source NOA, local tools, experiments and MAS declarations |
| `dev/` | Launcher, Compose overrides, helper tools and regression tests |

Install Docker with Compose v2.24.4+, Task, Go 1.25.9+, Python 3.11+, Poetry, uv,
Node.js 20 (at least 20.9) and npm. The Go modules use the shared API module
within this repository through `go.work` and relative module replacements.
Pulling private published container images requires GHCR access, including OXP or
Proxy images used by the infrastructure dependency. Authenticate Docker before
starting infrastructure if those images require it.

Prepare dependencies once, with compatible Python/Node versions selected:

```bash
(cd cf-mgmt && poetry install)
go -C api mod download
go -C cfn mod download
go -C samples/demo-ce mod download
npm --prefix cf-ui ci
(cd samples/template-ce && uv sync --frozen --extra test)
(cd samples/noa-trip-planner && uv sync --frozen --group dev)
```

Install the pinned proto tools described in [API development](../api/README.md)
when regenerating or checking bindings. Root `task proto` generates bindings;
`task proto:check` checks temporary output without rewriting tracked files.

## Configuration

The repository has one [`.env.example`](../.env.example), with commented sections
for shared infrastructure and each component. Copy it to root `.env`, then
configure the gateway URLs, model aliases and credentials. Root tasks load this
file and supply component-specific connection settings. Do not add a
`cf-mgmt/.env`: Management loads that file with override enabled, so the launcher
rejects it to protect the selected database.

```bash
cp .env.example .env
```

Set `CF_DEPLOYMENT_DIR` to your Deployment checkout. The example uses a sibling
directory:

```dotenv
CF_DEPLOYMENT_DIR=../ioc-scale-cf-deployment
```

Absolute paths are also supported, for example
`CF_DEPLOYMENT_DIR=/path/to/ioc-scale-cf-deployment`. Relative paths resolve from
the monorepo root, regardless of the directory where you invoke Task. Quote a
path containing spaces. The configured directory must contain
`docker-compose.yml`; the launcher reports a missing setting or checkout before
issuing Docker commands. Infrastructure, proxy and service tasks use this same
setting.

Supply your own gateway/model credentials and `NEXTAUTH_SECRET`. Set
`ENFORCEMENT_PLATFORM` for your host (`linux/arm64` or `linux/amd64`). OXP
infrastructure defaults to `linux/arm64`; on an Intel/AMD host, add
`OXP_INFRA_PLATFORM=linux/amd64` to root `.env` so those containers run natively.
OXP workers default to `linux/amd64`. Optional OXP and infrastructure tuning
variables are listed in the Deployment checkout's `.env.example`; add them to
root `.env` when overriding a default. The root template keeps CF settings,
required external configuration and deliberate overrides such as the ClickHouse
database shared with the OTel collector. Root tasks
load `.env` automatically, so mode settings do not need inline overrides.
The monorepo Compose override also uses this file for OXP and published NOA
container environments; no `.env` is needed in the Deployment checkout. Compose
2.24.4+ is required for replacing the inherited environment-file list with
[`!override`](https://docs.docker.com/reference/compose-file/merge/#replace-value).

The launchers write generated runtime files under gitignored `.local/`.
`CE_CONFIG_FILE` and `CE_MAS_FILE` accept absolute paths or paths relative to the
repository root. To prepare a Go Demo CE policy:

```bash
mkdir -p .local/ce
cp samples/demo-ce/config/config.json .local/ce/config.json
```

For the Go Demo CE, edit the private policy with the MAS ID created during your
own onboarding and its agent/tool identities, then set
`CE_CONFIG_FILE=.local/ce/config.json`. A single-policy configuration can also use
`CE_MAS_FILE` to supply the existing MAS ID. Source and image tasks use the same
private policy. No launcher creates MAS/CE associations for the operator.

Select the NOA implementation and enforcement path in root `.env`:

```dotenv
NOA_MODE=source
NOA_ENFORCEMENT_MODE=proxy
NOA_MAS_ID=
```

Leave `NOA_MAS_ID` empty until you onboard the MAS through your own Management
instance, then fill in the returned ID before starting NOA. Template CE can
start before that onboarding and does not need the Go Demo CE policy file.

`NOA_MODE` accepts `source` or `published`; `NOA_ENFORCEMENT_MODE` accepts `direct`
or `proxy`. Proxy mode requires source NOA. Direct mode still calls CFN before
tool execution, while proxy mode sends tool HTTP requests through Envoy.

## Start infrastructure and services

These are operator commands; each foreground service needs a separate terminal.
The infrastructure task preserves existing volumes and creates the local CF
databases only when absent. It refuses to mix unowned published CF containers
with local database services.

```bash
task infra:up
task run:cfn-mgmt
task run:cfn
task run:cf-ui
task run:template-ce
```

Wait for each service to be ready before starting the next. To use the Go CE,
choose `task run:demo-ce` instead of the Template CE task, after preparing its
policy. Stop the previous CE task before switching; select and enable the desired
CE association in Management. Running another CE does not select it for a MAS.
For notification tests, set `ENABLE_NOTIFICATIONS=true` in the root `.env`.

| Component | Host listener |
|---|---|
| Management | `9000` |
| UI | `9001` |
| CFN HTTP / gRPC | `9002` / `9003` |
| Template CE gRPC / health / notifications | `50051` / `8082` / `8080` |
| Go Demo CE HTTP / gRPC | `18000` / `18001` |
| NOA / source tools | `8125` / `8126` |
| Envoy | `9010` |
| OXP API / OTel HTTP collector | `8081` / `4318` |

Source listeners default to host loopback, except the source tool server, which
must be reachable from Docker. `LOCAL_CF_BIND_HOST=0.0.0.0` is an explicit option
for native Linux mixed source/image operation. Docker Desktop uses
`host.docker.internal`; CE registration advertises an address appropriate to
whether CFN is running from source or an image. The Template task synchronizes
locked runtime dependencies on startup while preserving installed extras.

### Optional: start services with captured logs

Use `tee` to keep output visible in the terminal and save stdout and stderr
under gitignored `.local/logs/`. These commands replace the plain foreground
commands above. Stop an existing instance before starting its logged replacement.
Run each service in a separate terminal and wait for readiness before starting
the next. Mode settings continue to load from the root `.env`.

In each terminal, from the monorepo root, prepare log capture:

```bash
mkdir -p .local/logs
set -o pipefail
```

Then run one service command per terminal:

```bash
task run:cfn-mgmt 2>&1 | tee .local/logs/management.log
```

```bash
task run:cfn 2>&1 | tee .local/logs/cfn.log
```

```bash
task run:cf-ui 2>&1 | tee .local/logs/ui.log
```

```bash
task run:template-ce 2>&1 | tee .local/logs/template-ce.log
```

```bash
task run:full-mas 2>&1 | tee .local/logs/noa.log
```

For the Go Demo CE, replace the Template CE command with:

```bash
task run:demo-ce 2>&1 | tee .local/logs/demo-ce.log
```

`tee` overwrites that service's log on each start; use `tee -a` to append instead.
For integration verification, capture Management, CFN, the selected CE and NOA
logs so health checks, enforcement and MAS notification receipt can be observed.

## Published CF images with the local databases

The existing image tasks pull the selected tag and run only that service through
[`compose/images.yaml`](compose/images.yaml). They share the existing Deployment
network and retain its service/container names and local ownership labels.
The image file deliberately has no build configuration or infrastructure
dependencies. Image builds use repository-root contexts separately.

```bash
task run:cfn-mgmt:image
task run:cfn:image
task run:cf-ui:image
task run:demo-ce:image
```

Choose source or image independently for each service, stopping its current
foreground task before switching. Restart the chosen CE task after switching
CFN source/image mode so its registered addresses match reachability. Tags remain
`CF_MGMT_SVC_TAG`, `CFN_SVC_TAG`, `CF_UI_TAG`, and `CF_DEMO_CE_TAG` with default
`latest`; `LOCAL_CF_MGMT_DB` deliberately selects another compatible local
Management database. Shell overrides take precedence over root Task dotenv.

## NOA onboarding and proxy mode

Register the declaration through Management using
[the NOA onboarding guide](../samples/noa-trip-planner/mas/README.md), select the
enabled/online CE started above, and set root `NOA_MAS_ID` to the canonical ID
returned by your Management instance. On a fresh database, Management creates
the admin's default workspace and CFN registration assigns the local node to it;
use that workspace for onboarding. A different workspace needs its own CFN
assignment. The source runner uses the new MAS ID for telemetry and enforcement.
The published NOA container must be stopped before the source runner starts.

```bash
task run:full-mas
```

In proxy mode, `infra:up` starts Envoy and mediation support. `run:full-mas`
generates exact MAS/tool routes, reloads Envoy, then supervises NOA and its source
HTTP tool server in one foreground process. Ctrl+C stops both source processes.
Generated files live in ignored root `.local/enforcement/`.

```text
Source NOA -> Envoy :9010 -> CFN :9003 -> associated CE
                    |
                    +-- ALLOW -> source tools :8126
                    +-- BLOCK / unavailable -> tool error to NOA
```

There is one proxy POST per proposed tool call and no direct/local execution
fallback or automatic retry. Traceparent and session identity accompany each
protected call. This protects tools, not every MAS/A2A/LLM interaction, and does
not establish the separate content-sensitive pre-call evidence pipeline.
Inspect existing proxy/mediation logs with `task proxy:logs`. After dependency
changes, stop NOA and rerun its locked `uv sync`; its launcher uses `--no-sync`.
See the [NOA guide](../samples/noa-trip-planner/README.md) for fake-LLM regression
checks and experiments.

## Checks and shutdown

With dependencies and local Postgres available:

```bash
task test
task check
task test:noa
task test:dev
```

The aggregate covers API, CFN, Management, UI, Go Demo CE, Template CE, NOA and
development/automation tests. Management's existing fixtures recreate tables only
in the dedicated `ioc_test` database; the launcher verifies its connection target
first. `task check` uses nonmutating lint and generation drift checks, then runs
the aggregate. `test:dev` uses Management's Python environment for real Alembic
graph checks; its launchers use command stubs and temporary local listeners,
without starting services or migrating a real database.

`task test:integration` is separate: it starts throwaway Postgres 17 on
`127.0.0.1:55432` and runs CFN process tests with mocked Management/CE peers. CI
uses its supplied isolated database with `INTEGRATION_SKIP_DB=true`.

Stop foreground tasks with Ctrl+C. `task infra:down` stops only owned local CF
images, the local proxy and infrastructure; it keeps volumes. It refuses to stop
unowned services from the standalone published Deployment workflow.

## Use Envoy with source NOA

The [NOA onboarding and proxy mode](#noa-onboarding-and-proxy-mode) section describes
root tasks and the required source/proxy settings. The launcher renders local
routes and enforces ownership of its Envoy bind mount; do not bypass that guard
when another checkout's proxy container is already present.

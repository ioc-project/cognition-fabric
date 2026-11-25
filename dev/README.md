# Run Cognition Fabric locally

Run these commands from the `cognition-fabric` repository root. The local tasks
run CF components from this checkout and use [deploy/](../deploy/README.md) to
start Postgres and OXP infrastructure. Published native NOA A2A and Enforcement
Proxy start together after MAS onboarding; CF source/image choices stay independent.

## Fresh checkout

Clone the repository, then work from its root:

```bash
git clone https://github.com/cisco-eti/cognition-fabric.git
cd cognition-fabric
```

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
| `deploy/` | Shared Compose stack, enforcement overlays and database image source |

Install Docker with Compose v2.24.4+, Task, Go 1.25.9+, Python 3.11+, Poetry, uv,
Node.js 20 (at least 20.9) and npm. The Go modules use the shared API module
within this repository through `go.work` and relative module replacements.
Pulling private published container images requires GHCR access, including OXP or
Proxy images. Authenticate Docker before starting them when required. The NOA
proxy launcher also downloads reviewed upstream runtime files into ignored local
cache. If that source repository requires authentication, install GitHub CLI
(`gh`) and authenticate with read access; no separate proxy checkout is needed.
Native NOA tasks use uv to select an installed Python 3.11+ for the upstream
launcher. They do not download Python; macOS's system Python 3.9 is insufficient.

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

Supply your own gateway/model credentials and `NEXTAUTH_SECRET`. Set
`ENFORCEMENT_PLATFORM` for your host (`linux/arm64` or `linux/amd64`). OXP
infrastructure defaults to `linux/arm64`; on an Intel/AMD host, add
`OXP_INFRA_PLATFORM=linux/amd64` to root `.env` so those containers run natively.
OXP workers default to `linux/amd64`. Optional OXP and infrastructure tuning
variables are listed in the root template's "Optional infrastructure overrides"
section. The root template keeps CF settings,
required external configuration and deliberate overrides such as the ClickHouse
database shared with the OTel collector. Root tasks
load `.env` automatically, so mode settings do not need inline overrides.
The monorepo Compose override also uses this file for OXP and published NOA
container environments. The standalone [deployment workflow](../deploy/README.md)
also loads root `.env`. Compose
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
NOA_MODE=published
NOA_ENFORCEMENT_MODE=proxy
NOA_MAS_ID=
NOA_MCP_SERVER_ID=
```

Leave `NOA_MAS_ID` empty until you onboard the MAS through your own Management
instance, then fill in the returned ID before starting NOA. Template CE can
start before that onboarding and does not need the Go Demo CE policy file.

`NOA_MODE` accepts `source` or `published`. Published/proxy selects the native
NOA A2A image with the maintained Envoy controller; source/direct keeps the
copied application's direct CFN adapter. Source/proxy is rejected. The existing
published/direct option runs the standalone deployment sample without attaching
the proxy; it does not provide the source adapter's direct CFN enforcement.

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
| NOA API | `8125` |
| A2A / MCP / Envoy | Internal to the MAS Compose project |
| OXP API / OTel HTTP collector | `8081` / `4318` |

Source listeners and the NOA API default to host loopback. `LOCAL_CF_BIND_HOST=0.0.0.0` is an explicit option
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
[`compose/images.yaml`](compose/images.yaml). They share the existing stack
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

`CF_REGISTRY` defaults to `ghcr.io/ioc-project` for CF images and the shared DB
started by `infra:up`; the DB tag remains `0.2.0`. Existing `.env` values override
the defaults, so change `CF_REGISTRY` explicitly to adopt the new registry in an
existing configuration. Proxy images use `PROXY_REGISTRY` independently, defaulting
to `ghcr.io/cisco-eti`. If a custom CF registry previously also hosted your Proxy
images, set that location in `PROXY_REGISTRY`.

## NOA onboarding and proxy mode

The native workflow uses our existing CFN, Management, UI, OXP and selected Go
Demo or Python Template CE. Its separate Compose project contains the MAS and
its proxy; it does not deploy another CF platform.

1. Configure root `.env` with `NOA_MODE=published` and
   `NOA_ENFORCEMENT_MODE=proxy`. Leave MAS IDs empty initially. Start infrastructure
   and our CF/CE tasks as described above. `infra:up` requires no MAS and does not
   start the proxy.
2. In Management UI, create a MAS using **JSON** mode and paste
   [`noa-a2a-mas.json`](../samples/noa-trip-planner/mas/noa-a2a-mas.json).
   Select the existing enabled, online CE before saving. Use a workspace assigned
   to this CFN. See [onboarding](../samples/noa-trip-planner/mas/README.md).
3. Read back that MAS. Set root `NOA_MAS_ID` to its canonical ID and
   `NOA_MCP_SERVER_ID` to `mcp_servers[0].id`. Keep the declaration's agent IDs.
   Custom identities can instead be supplied as upstream canonical JSON through
   `NOA_IDENTITY_FILE`; workload references must use this runtime's project and
   service names.
4. For Go Demo CE, copy [`noa-demo-ce.example.json`](noa-demo-ce.example.json) into
   ignored local configuration, replace both ID placeholders, set `CE_CONFIG_FILE`
   to that copy and restart only your Demo CE task. Template CE needs no policy
   file. CE selection still comes from Management associations.
5. Wait until CFN exposes the assigned MAS at
   `http://localhost:9002/api/multi-agentic-systems/<MAS_ID>`. Check that its
   enabled, online CE associations select the CE you intend to use, including
   after switching or restarting CEs. Then run:

   ```bash
   task run:full-mas
   ```

The task pulls the selected images, starts the native application helpers, and
lets the upstream controller generate routes, client credentials and activation.
It waits for controller qualification, then remains in the foreground showing
controller logs. Ctrl+C retires the MAS/proxy and stops its Compose services,
retaining state and volumes. The upstream controller remains available for
enrollment. No application or proxy image is built locally.

```text
Client -> NOA API :8125 -> moderator
                            |
                     Envoy -> CFN :9003 -> selected CE
                       |
                       +-- allowed A2A / MCP / LLM requests -> real upstream
```

The API ingress is unmediated, as in the upstream Envoy demo. Agent networks are
internal. The MCP server and Envoy share a guarded namespace; only the guard
initializer receives BPF/NET_ADMIN. Docker Desktop/Linux kernel support is
required. A small OTLP relay forwards telemetry to our existing collector.
The maintained proxy sends audit directly to CFN; this path uses no mediation
service or source NOA tool server.

Custom NOA/proxy images default to `latest`. Each explicit start pulls the
selected references once, then starts them without a second pull. Proxy images
use `PROXY_REGISTRY`; native NOA A2A keeps its existing `OXP_REGISTRY` default.
Use `NOA_A2A_TAG`, the `NOA_PROXY_*_TAG` selectors or full image overrides to select
another compatible build. Envoy keeps the upstream ABI-compatible version.
Changing image versions can require matching configuration changes, as with CF
images. Ordinary starts require the previous MAS runtime to be retired/stopped.

```bash
task noa:status
task proxy:logs
task noa:down
```

Private installation inputs live in `.local/noa-a2a/`; downloaded upstream files
live in `.local/proxy-runtime/`. Do not edit generated routes, credentials or
activation files. If startup fails, inspect `noa:status` and controller logs,
then use `noa:down` before retrying. Existing standalone deployments from another
workflow must be stopped by their owner; these tasks do not adopt them.

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
images, the native MAS/proxy and infrastructure; it keeps volumes. It refuses to stop
unowned services from the standalone published Deployment workflow.

## Enforcement setup

Use the [published NOA A2A workflow](#noa-onboarding-and-proxy-mode) for network
proxy enforcement. Source NOA runs with `NOA_ENFORCEMENT_MODE=direct`.

# Local CF source workflow

Run these commands from the `ioc-scale-cfn-svc` checkout. The sibling
[`ioc-scale-cf-deployment`](https://github.com/cisco-eti/ioc-scale-cf-deployment)
checkout supplies the Compose stack; its published-image workflow remains
available independently. This CFN checkout owns the local workflow `.env`.

## Checkout and prerequisites

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
cp .env.example .env
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

## Start the local stack

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

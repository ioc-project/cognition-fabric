# Develop Cognition Fabric from source

Run CF Management, CFN, CF UI, and the Template CE from your checkout. Docker
runs their backing infrastructure, including PostgreSQL and SCOPE.

## Prepare the checkout

Install Docker with Compose 2.24.4+, Go Task, Make, Go 1.25.9+, Python 3.11+,
Poetry, uv, Node.js 20 (at least 20.9), and npm. Follow the repository's
[fresh checkout setup](https://github.com/ioc-project/cognition-fabric/blob/main/dev/README.md#fresh-checkout)
to install the pinned dependencies and select your Docker platforms.

Copy root `.env.example` to `.env` for a fresh checkout. Set
`ADMIN_USER_PASSWORD` and `NEXTAUTH_SECRET` for local sign-in. To run NOA, also
set `AI_GATEWAY_BASE_URL`, `AI_GATEWAY_API_KEY`, and `NOA_LLM_MODEL`. See the
[quickstart configuration table](quickstart.md#configure-and-start-the-platform)
for these settings. If the published deployment is running, stop it first
to release the shared host ports.

## Start services

Start the infrastructure from the repository root.

```sh
task infra:up
```

Run each foreground task in its own terminal in the order shown below. Wait
for each service to become ready before starting the next.

| Command | Ready when |
| --- | --- |
| `task run:cfn-mgmt` | `http://localhost:9000/health` responds successfully. |
| `task run:cfn` | `http://localhost:9002/api/internal/diagnostics/health` responds successfully. |
| `task run:cf-ui` | You can sign in at `http://localhost:9001`. |
| `task run:template-ce` | Management lists `template-ce` as enabled and online. |

The source workflow uses `cfn_mgmt_local` for Management and `cfn_audit_local`
for CFN audit records. PostgreSQL is available on host port `5456` by default.
CFN serves HTTP on `9002` and gRPC on `9003`.

Create a MAS in this running stack
[using the bundled declaration](quickstart.md#onboard-the-noa-sample). Use this
stack's saved MAS and MCP server IDs when [running NOA](quickstart.md#run-the-trip-planner)
and [inspecting audits](quickstart.md#read-the-audit-trail).

## Validate and stop

With the dependencies installed and local PostgreSQL available, run:

```sh
task test
task check
```

`task check` adds lint and generation drift checks and runs the test suites.
See the [source workflow checks](https://github.com/ioc-project/cognition-fabric/blob/main/dev/README.md#checks-and-shutdown)
for the separate integration and component commands.

Stop NOA with Ctrl+C or `task noa:down`. Stop the foreground CE, UI, CFN, and
Management tasks with Ctrl+C, then run `task infra:down`. The local databases
and volumes are preserved.

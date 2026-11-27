# Run Cognition Fabric and NOA

Start CF and SCOPE from published images, onboard an example multi-agent system
(MAS) called NOA A2A Trip Planner, and follow a mediated interaction in the
Management UI.

## Prerequisites

- Docker with Compose 2.24.4 or newer. The NOA sample uses the Proxy's Envoy
  runtime. The Docker kernel must support BPF and the guard initializer must
  be able to use `NET_ADMIN`.
- Git, [Go Task](https://taskfile.dev/installation/), Make, curl, uv, and an
  installed Python 3.11 or newer. The launcher uses uv to select that Python.
- An OpenAI-compatible Chat Completions endpoint and a key for a model that
  supports tool calls. Use the model name your provider expects.

The template defaults to `linux/amd64` for NOA and SCOPE workers, and
`linux/arm64` for SCOPE infrastructure and the Proxy. On an Intel or AMD
Docker host, set `SCOPE_INFRA_PLATFORM=linux/amd64` and
`ENFORCEMENT_PLATFORM=linux/amd64`. Set `NOA_A2A_PLATFORM` separately to select
the sample application's architecture. See the
[deployment platform and port settings](https://github.com/ioc-project/cognition-fabric/blob/main/deploy/README.md)
for the other selectors.

## Configure and start the platform

```sh
git clone https://github.com/ioc-project/cognition-fabric.git
cd cognition-fabric
cp .env.example .env
```

Set these values in the root `.env` file before startup.

| Setting | Value |
| --- | --- |
| `ADMIN_USER_PASSWORD` | The password Management sets when it first creates the local `admin` account. |
| `NEXTAUTH_SECRET` | A random secret. Generate one with `openssl rand -hex 32`. |
| `AI_GATEWAY_BASE_URL` | Your provider's Chat Completions API base URL. |
| `AI_GATEWAY_API_KEY` | Your provider credential. |
| `NOA_LLM_MODEL` | An explicit tool-capable model name from that provider. |

Leave `DEPLOY_CE=template` and `TEMPLATE_CE_DECISION=allow`. Keep
`DEPLOY_ENFORCEMENT` empty. NOA starts its own Proxy when you launch the sample.
Run this command from the repository root.

```sh
task deploy:up
```

The task pulls the configured images and starts the platform with the published
Python Template CE. Check Management and CFN before onboarding.

```sh
curl --fail http://localhost:9000/health
curl --fail http://localhost:9002/api/internal/diagnostics/health
```

## Onboard the NOA sample

1. Open the Management UI at [http://localhost:9001](http://localhost:9001).
   Sign in with username `admin` and the password you set in
   `ADMIN_USER_PASSWORD` in the root `.env` file. If you are reusing an existing
   deployment, use the admin account's current password. Open
   [**Cognition Engines**](http://localhost:9001/cognitive-agents)
   in the left sidebar. Find `template-ce` and check that it shows **Enabled**
   and **Online**.
2. Open **Multi-Agentic Systems** and create a MAS. Switch to **JSON** mode and
   paste the contents of [`noa-a2a-mas.json`](https://github.com/ioc-project/cognition-fabric/blob/main/samples/noa-trip-planner-a2a/mas/noa-a2a-mas.json)
   from your checkout.
3. Save the declaration. Management associates the default `template-ce`
   automatically. If you use a CE configured for manual association, switch to
   **Form** mode before saving and choose it under **Cognition Engines**.
   Check the saved MAS's **Cognition Engines** and **Topology** tabs for the
   associated CE and the declared topology.
4. On the saved MAS page, copy the MAS ID and the ID shown on the **NOA tools**
   MCP server card into root `.env`. Use the IDs assigned by Management.

```dotenv
NOA_MAS_ID=<saved MAS ID>
NOA_MCP_SERVER_ID=<saved NOA tools MCP server ID>
```

Wait for CFN to expose the MAS before starting NOA. Substitute the ID copied
from the UI below.

```sh
curl --fail 'http://localhost:9002/api/multi-agentic-systems/<MAS_ID>'
```

## Run the trip planner

Start NOA in a foreground terminal at the repository root.

```sh
task run:full-mas
```

This builds the bundled NOA A2A app and starts its Envoy sidecar and controller
in a separate Compose project. Leave that terminal running. From another
terminal, check that NOA is ready.

```sh
curl --fail --write-out '\n' http://127.0.0.1:8125/ready
```

Once the response is `{"status":"ready"}`, ask the sample about a schedule.
This request makes several model and tool calls and can take a minute or more.
The endpoint sends its JSON response after the trip planner finishes.

```sh
curl --fail --write-out '\nHTTP %{http_code} in %{time_total}s\n' \
  http://127.0.0.1:8125/ask \
  -H 'Content-Type: application/json' \
  -d '{"question":"Use the schedule documents to show me train schedules from Luminos to Celestia."}'
```

The last line shows the HTTP status and elapsed time. Look for `HTTP 200`
and a usable answer in `final_answer`. Tool choices and answer wording can
vary by model.

## Read the audit trail

Open the saved MAS in Management and select **Audit** to open **Audit Trail**.
Use **Group by Trace ID** to find the newest trace from your request. Expand
the group and inspect one mediated call.

- **CE Invoked** shows the selected CE and the decision CFN returned.
- **Proxy Mediated** shows what the Proxy applied. Choose **Show audit JSON**
  for an allowed call that finished upstream and check `audit_information` for
  `applied_outcome: APPLIED_OUTCOME_ALLOWED` and
  `upstream_invocation: UPSTREAM_INVOCATION_STATE_COMPLETED`.

Use the trace and span fields to correlate the decision with its mediated call.
An MCP request in the trace shows that the sample delegated work and exercised
a tool. See [Enforcement](../enforcement.md#record-the-result) for the two RPCs
that produce this evidence.

## Inspect and stop

```sh
task noa:status
task proxy:logs
```

Press Ctrl+C in the NOA terminal or run `task noa:down` to retire the MAS
runtime and its Proxy. Then stop the platform. These commands preserve volumes.

```sh
task deploy:down
```

See the [deployment guide](https://github.com/ioc-project/cognition-fabric/blob/main/deploy/README.md)
for image selection and deployment troubleshooting.

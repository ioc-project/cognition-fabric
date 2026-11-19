# Local NOA enforcement modes

**Scope:** The monorepo's local source/image workflow and its bundled NOA application.

**Guidance:** Root tasks use published native NOA A2A with the maintained proxy
for `NOA_MODE=published` / `NOA_ENFORCEMENT_MODE=proxy`. Source/direct retains the
copied NOA's direct CFN adapter. Source/proxy is rejected; it cannot drive the
new controller through the old host tool-service fixture.

`infra:up` starts platform dependencies without requiring a MAS. Start our CFN,
Management, UI and chosen Demo/Template CE, onboard the separate A2A declaration,
then set its canonical MAS and generated MCP server IDs before `run:full-mas`.
The controller owns only a separate MAS Compose project. It generates routes,
credentials and activation; do not synthesize a static activation lease or enrol
the CF/OXP project. Published images require no local image builds.

Image selection follows CF `:image`: default custom tags to latest, preserve
explicit tag/full-reference overrides, pull before starting, then reuse those
images. The wrapper passes complete published references to upstream's local
reuse mode with builds disabled, avoiding an extra pull during enrollment.
Preserve upstream's reviewed launcher/recipe as cached external dependencies,
including its literal dotenv parser and license. Source access may require gh
authentication while the upstream repository is private.
Use the installed Python 3.11+ selected by uv for every native lifecycle action,
including its upstream subprocesses. Python 3.9 cannot parse nanosecond lease
timestamps: the runtime may be Active while the host readiness check reports
false and eventually times out.

Keep one root `.env.example`. Project only the MAS/proxy settings into private
`.local/noa-a2a/` inputs; keep the upstream cache in `.local/proxy-runtime/`.
Require retirement as well as stopped containers before replacing authoritative
controller inputs. Validate candidate configuration and finish pulls first.
Both paths preserve the CF project's network, volumes and local database names;
container database connections use port 5432, independent of the host port.

The native MCP server is loopback-bound with Envoy in a guarded namespace. Use
separate, internal agent networks, plus a small telemetry relay connected to
those networks and the existing platform collector. A relay sharing an old
namespace can lose connectivity when the controller replaces its anchor.
Keep public API ingress outside startup-fenced applications. Qualification of
the 49c3004 runtime on Docker Desktop hit the compiled three-second Compose
read timeout with ports on the moderator; a separate API forwarder permitted
activation. Its DNS must follow moderator replacements and its timeout must
cover the full MAS request. API ingress remains unmediated.

CF source tasks have `:image` counterparts for management, CFN, UI, and Go Demo
CE. These images share the source workflow's `cfn_mgmt_local` / `cfn_audit_local`
databases, carry the `io.cisco.cf.local=true` ownership label, and run on the
existing infrastructure network. NOA/proxy tasks accept these owned images but
reject unrelated running CF containers from the standalone deployment. The
published A2A application uses different transports/identities from the copied
source sample. Its Observe session prefix is the fixed application name, not the
onboarded MAS UUID. Treat that session ID as opaque; join application trace/span
IDs to Proxy/CFN records carrying the controller's canonical MAS identity.
Selecting a CF image must not implicitly switch NOA modes.

CE advertised addresses depend on whether CFN runs on the host or in a
container. Restart CEs after changing CFN's implementation so they re-register
the appropriate addresses. The local image Compose file uses host-facing CF
ports for management/UI/CFN links, allowing each service to switch independently.

Sharing management state requires a compatible Alembic lineage. Source and
image tasks run the read-only preflight before their migration entrypoints;
the image task pulls before the check and starts without a second pull. Use
`LOCAL_CF_MGMT_DB` with the same override on `infra:up` and management starts
to isolate incompatible histories. Do not automatically stamp/downgrade/reset.

Source management and Go Demo CE keep loopback binds by default. Docker Desktop
can reach these through `host.docker.internal`; native Linux mixed mode may
require an explicit `LOCAL_CF_BIND_HOST` IPv4 override. Port checks must cover
IPv4 and IPv6 listeners: a reusable IPv4 wildcard bind can miss macOS loopback
listeners, and removing reuse alone still misses IPv6-only sockets.

The local application is based on upstream `noa-trip-planner/`; the separate
`noa-trip-planner-a2a/` has different transports and dependencies. Compare upstream
changes by application, retain the CFN/proxy integration, and update the local
lockfile when adopting a shared Observe SDK update.

For coalition experiments against the local CF stack, prefer the copied HTTP
runner with the running source NOA (`http://localhost:8125` by default). Its
`available_agents` selection changes the graph's specialists, while selected
agents retain the source application's direct CFN adapter. The upstream
in-process runner bypasses the CF launcher's environment setup. Keep the
application's checkpoint message history in `/ask` responses so the experiment
runner can count the actual messages.

Both template and demo CEs answer CFN's `Evaluate` calls for either the direct
source adapter or native A2A/proxy runtime. The local
template task assigns health port 8082 separately from its fixed notification port
8080, and runs `uv run --frozen` to synchronize locked dependencies after source
updates. When switching CEs, the chosen CE must be associated, enabled, and
online; CFN does not select a CE based on which local task was started last.

Keep the root tasks and `dev/cf-local.sh` in sync: `run:template-ce` runs Python
from `samples/template-ce/`, while `run:demo-ce` builds
`samples/demo-ce/cmd/demo-ce` and passes `CE_CONFIG_FILE`. Python's forced verdict
uses `TEMPLATE_CE_DECISION`. Name
overrides are `DEMO_CE_NAME` and `TEMPLATE_CE_NAME`, forwarded to native
`CE_NAME` only when explicitly configured. Names, versions and CE types
otherwise come from each CE's own registration defaults. Remove obsolete
policy-CE aliases from the launcher, examples and local configuration. The
shared Compose project now contains
only `ioc-scale-cf-demo-ce`; do not query the removed policy CE service in the
source-workflow container guard.

The Go CE registers a base `health_url` plus a separate `health_endpoint=/healthz`.
Set `ADVERTISED_HEALTH_URL=http://<reachable-host>:18000` in the local runner, without the
path: CFN appends the endpoint, so including it twice makes a running CE look
offline. [CE endpoint ownership](ce-endpoint-ownership.md) is established by
registration and reconnect PATCH, so an obsolete registration at a reused address
does not become online merely because the replacement answers health probes.

**Why:** An HTTP proxy cannot intercept Python function calls. Native A2A, MCP
and LLM traffic crosses the network and must preserve its own Observe context.
Do not duplicate direct application authorization or fall back to local tool
execution. Identity-based routing does not establish content-evidence readiness.
Validate real producer audit delivery separately from CF's ingestion contract.

**Evidence:** [Local workflow](../../dev/README.md#noa-onboarding-and-proxy-mode),
[NOA integration](../../samples/noa-trip-planner/README.md#published-noa-a2a-and-enforcement-proxy), and
[local launcher](../../dev/cf-local.sh).

**Revisit when:** Upstream runtime, image, startup, identity or proxy
configuration contracts change. Use the integration-test skill as a template;
its source-only prerequisites and proposed-tool spans do not fit native A2A.

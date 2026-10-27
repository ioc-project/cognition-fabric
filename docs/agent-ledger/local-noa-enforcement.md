# Local NOA enforcement modes

**Scope:** CFN's local source workflow and its bundled NOA application.

**Guidance:** `NOA_MODE` selects source (the default) versus published NOA;
`NOA_ENFORCEMENT_MODE` selects direct versus proxy enforcement for source NOA.
Both are read from CFN's `.env`. Proxy mode is rejected for the published image.
Infrastructure includes Envoy only in proxy mode, while the source NOA task
supervises its HTTP tool service. Direct mode retains its in-process tools and
direct CFN authorization call.

CFN owns the source-specific Compose override and generated configuration.
The deployment checkout supplies reusable images and overlays and is not
modified by these tasks. MAS-specific routes are generated when NOA starts;
infrastructure can start before a MAS exists.

CE choice is independent of the source NOA enforcement mode: both template and
demo CEs answer CFN's `Evaluate` calls in direct and proxy modes. The local
template task assigns health port 8082 separately from its fixed notification port
8080, and runs `uv run --frozen` to synchronize locked dependencies after sibling
updates. When switching CEs, the chosen CE must be associated, enabled, and
online; CFN does not select a CE based on which local task was started last.

The Python `demo-ce/` was renamed to `template-ce/`; the Go `policy-ce/` became
`demo-ce/`. Keep the CFN top-level tasks and launcher in sync: `run:template-ce`
runs Python, while `run:demo-ce` builds `demo-ce/cmd/demo-ce` and passes
`CE_CONFIG_FILE`. Python's forced verdict uses `TEMPLATE_CE_DECISION`. Name
overrides are `DEMO_CE_NAME` and `TEMPLATE_CE_NAME`, forwarded to native
`CE_NAME` only when explicitly configured. Names, versions and CE types
otherwise come from each CE's own registration defaults. Remove obsolete
policy-CE aliases from the launcher, examples and local configuration. The
shared Compose project now contains
only `ioc-scale-cf-demo-ce`; do not query the removed policy CE service in the
source-workflow container guard.

The Go CE registers a base `health_url` plus a separate `health_endpoint=/healthz`.
Set `ADVERTISED_HEALTH_URL=http://127.0.0.1:18000` in the local runner, without the
path: CFN appends the endpoint, so including it twice makes a running CE look
offline. Old registered CEs sharing the same valid health URL can appear online
when any process answers that address; a successful probe does not establish the
CE's registered identity or version. Restarting services preserves these records.

**Why:** An HTTP proxy cannot intercept Python function calls. Proxy mode must
send actual tool traffic through Envoy, preserve the proposed call's trace
context, and avoid a second direct authorization or local-execution fallback.
Identity-based routing does not establish OXP event delivery or content-evidence
readiness.

**Evidence:** [Source workflow](../../deploy/README.md#use-envoy-with-source-noa),
[NOA integration](../../deploy/local/noa-trip-planner/README.md#proxy-mode), and
[local launcher](../../deploy/local/cf-local.sh).

**Revisit when:** The source NOA is replaced by a network-native sample, the
published image supports the same mode switch, or proxy configuration contracts
change.

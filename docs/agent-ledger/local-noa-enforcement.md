# Local NOA enforcement modes

**Scope:** CFN's local source workflow and its bundled NOA application.

**Guidance:** `NOA_MODE` selects source versus published NOA;
`NOA_ENFORCEMENT_MODE` selects direct versus proxy enforcement for source NOA.
Both are read from CFN's `.env`. Proxy mode is rejected for the published image.
Infrastructure includes Envoy only in proxy mode, while the source NOA task
supervises its HTTP tool service. Direct mode retains its in-process tools and
direct CFN authorization call.

CFN owns the source-specific Compose override and generated configuration.
The deployment checkout supplies reusable images and overlays and is not
modified by these tasks. MAS-specific routes are generated when NOA starts;
infrastructure can start before a MAS exists.

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

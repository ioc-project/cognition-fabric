# Envoy flavor

This optional component runs Envoy, the published Go sidecar and traceparent
Wasm filters, and a diagnostic Nginx upstream. Decisions and finalized audits go
directly to CFN.

This recipe starts components. MAS attachment, identities, routes and controller
activation belong to the MAS developer. It does not attach NOA, onboard a MAS or
install a controller. Default activation is **unprovisioned**: protected requests
are rejected. Registering MAS/agent IDs alone is insufficient for activation.

## Start from the monorepo root

Complete the root environment and Demo CE setup in
[`deploy/README.md`](../../README.md). Docker Compose 2.24.4+ and Python 3 are
required; all runtime images are published, with no local image builds.

1. Copy the private route example:

   ```bash
   cp deploy/enforcement/envoy/sidecar-spec.example.yaml deploy/enforcement/envoy/sidecar-spec.yaml
   ```

2. Edit the private spec. Each exact-path route declares MAS/source/destination
   IDs, protocol, item kind and an `upstream_cluster`. The example cluster
   `upstream` points at Nginx, which echoes the received `traceparent`. It does
   not forward requests to NOA. Placeholder IDs describe the configuration shape.

3. Check, pull and start:

   ```bash
   make -C deploy doctor enforcement=envoy
   make -C deploy pull enforcement=envoy
   make -C deploy up enforcement=envoy
   make -C deploy status
   make -C deploy logs service=ioc-scale-enforcement-proxy-envoy
   ```

   Switching flavors requires `make -C deploy down` first.

4. Inspect the component and stop it when finished:

   ```bash
   curl -i http://127.0.0.1:9010/replace-with-exact-path
   curl -s http://127.0.0.1:9012/stats
   make -C deploy down
   ```

   Protected example traffic is rejected without activation. An unmatched path
   can pass to Nginx; a 200 there does not prove enforcement. `down` keeps volumes.

## Configuration and preparation

| Input | Default, relative to `deploy/` unless absolute |
| --- | --- |
| `SIDECAR_SPEC` | `./enforcement/envoy/sidecar-spec.yaml` |
| `ENVOY_BOOTSTRAP_TEMPLATE` | `./enforcement/envoy/envoy.yaml` |
| `ENVOY_ACTIVATION_DIR` | `../.local/deploy-envoy/activation` |

Root `.env` supplies settings; exported shell values take precedence. Paths may
contain spaces. The launcher never sources or rewrites `.env`.

`doctor/up` run [`prepare-envoy.py`](../../scripts/prepare-envoy.py), using only
the Python standard library. It hashes the exact spec bytes, replaces
`__SIDECAR_SPEC_SHA256__` in the template and atomically writes the prepared
bootstrap to monorepo `.local/deploy-envoy/generated/envoy.yaml`. It creates the
default empty activation directory but never a lease. An explicitly selected
activation directory must exist; its contents are preserved.

The generated directory, spec and activation directory are mounted read-only.
The template is an input, not a ready-to-run bootstrap. Both Go filter references
require the digest and an activation reference with epoch/generation. The example
references `/etc/sidecar/activation/control.json` with unprovisioned values.

`doctor` starts no containers. `config/pull` work before private inputs exist;
`status/logs/down` work after they are removed. Before using Compose directly,
run `doctor` and repeat it when inputs change. Makefile `up` recreates Envoy after
prepared content changes and restarts it after installer updates so the running
process loads the selected plugin/Wasm artifacts.

Keep Envoy `contrib-v1.38.0` with a compatible sidecar. All four overlay services
use `ENFORCEMENT_PLATFORM` (default `linux/arm64`; use `linux/amd64` on Intel/AMD).
The Go plugin must match Envoy's ABI and architecture. Installers finish before
Envoy starts.

## MAS owner configuration

Use the maintained [proxy MAS integration guide](https://github.com/ioc-project/enforcement-proxy/tree/main/demos/docker-compose/example-mas)
for the separate attachment/activation workflow. This platform keeps its existing
NOA image. The generic Nginx example is not an application adapter.

For private clusters/reference fields, copy `envoy.yaml` to an ignored location,
set `ENVOY_BOOTSTRAP_TEMPLATE` and retain the digest marker. The MAS owner supplies
matching controller-managed activation configuration; a directory mount keeps
atomic lease renewals visible. This launcher does not enroll a generic proxy or
manufacture activation authority.

`allow_insecure_local: true` is for plaintext local testing. Real authenticated
attachment needs a client-certificate-validating listener and matching
`source_uri_san`, as documented upstream. Host ports are loopback-only `9010`
(inbound), `9011` (outbound), `9012` (admin). See the shared
[settings and rollback procedure](../README.md).

# Envoy flavor

Envoy in front of an upstream. Each request passes the traceparent Wasm filter
(adds a `traceparent` if missing), then the Go sidecar filter, which asks CF for a
decision and writes an audit record to `ioc-scale-enforcement-proxy-mediation`.

Run these commands from `deploy/`, with the monorepo root `.env` configured.

```bash
cp enforcement/envoy/sidecar-spec.example.yaml enforcement/envoy/sidecar-spec.yaml
# edit the routes, then:
make up enforcement=envoy
```

| File | Role |
|------|------|
| [`compose.yaml`](compose.yaml) | Overlay: the two installer jobs, a test upstream and Envoy |
| [`envoy.yaml`](envoy.yaml) | Bootstrap. Inbound `18080`, outbound `18081`, admin `19000` |
| [`sidecar-spec.example.yaml`](sidecar-spec.example.yaml) | Routes that get mediated. Copy to `sidecar-spec.yaml` |
| [`upstream-nginx.conf`](upstream-nginx.conf) | Test upstream that echoes the received `traceparent` |

The installers copy the Go plugin (`ioc_sidecar_core.so`) and the Wasm filter into
two named volumes, which Envoy mounts read-only. Both exit 0 when done, and Envoy
waits for them.

## Routes

A route needs an exact `path`, the `mas_id`, source and destination agent IDs, and
an `upstream_cluster` that names a cluster in `envoy.yaml` (the default one is
`upstream`). The example uses `allow_insecure_local: true`, which skips source
authentication for plaintext local use. Production removes it and sets
`source_uri_san`, behind a TLS listener that validates client certificates.

## Protect your own application

1. Run the application on the stack network, or reachable from it.
2. In `envoy.yaml`, point the `upstream` cluster's `address` at it.
3. Drop the `ioc-scale-enforcement-proxy-upstream` service from `compose.yaml` if you no longer
   want the test echo server.
4. Send traffic to `127.0.0.1:9010` instead of the application.

## Try it

```bash
curl -i http://127.0.0.1:9010/replace-with-exact-path    # your route path
curl -s http://127.0.0.1:9012/stats | head               # Envoy admin stats
make logs service=ioc-scale-enforcement-proxy-envoy
```

Tested against the local stack with a route for `/echo` and an unregistered MAS:

- A request to the route got `403 blocked: enforcement unavailable`. The Wasm filter
  injected a `traceparent`, the sidecar asked CF, CF answered `NotFound` for the
  unknown MAS, and `ENFORCEMENT_FAILURE_POSTURE=fail_closed` blocked it. Use a
  `mas_id` and agent IDs registered in CF to get an allow.
- A path with no route was not mediated and went straight to the upstream (200).

Ports and shared variables are in [`../README.md`](../README.md). Override the
Envoy host ports with `ENVOY_HTTP_PORT`, `ENVOY_OUTBOUND_HTTP_PORT` and
`ENVOY_ADMIN_PORT`.

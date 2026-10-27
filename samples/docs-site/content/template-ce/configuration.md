---
title: Configure Template CE
---

# Configure Template CE

| Variable | Default | Purpose |
|---|---|---|
| `CE_NAME` | `template-ce` | CFN registration name |
| `CE_VERSION` | `1.0.0` | Registration version |
| `CFN_URL` | Empty | CFN base URL; empty skips registration |
| `COGNITION_ENGINE_HOST` | `localhost` | Host advertised to CFN |
| `GRPC_PORT` | `50051` | gRPC listener and advertised port |
| `HEALTH_PORT` | `8080` in code | Health listener; use `8081` locally to avoid the notification listener |
| `COGNITION_STORE_URL` | Empty | OXP base URL; empty skips findings I/O |
| `HTTP_PORT` | `8080` | Advertised notification port; the listener itself is fixed at `8080` |
| `ENABLE_NOTIFICATIONS` | `true` | Controls notification metadata included in registration |

`ENABLE_NOTIFICATIONS` does not stop the notification HTTP server from starting.
Do not use it to resolve a listener port collision. Invalid or unavailable health ports stop startup
before gRPC and registration.

## Registration and health

Startup starts the health listener first, then gRPC and the notification listener, and registers with CFN
when `CFN_URL` is set. The registration advertises the gRPC enforcing address, service name, health URL
and optional notification metadata. Conflict recovery updates the existing registration.
CFN probes the advertised health URL; the template does not replace these probes with heartbeats.

## Multiple local instances

Changing only the gRPC and health ports is insufficient to run two instances on the same host.
The fixed notification listener still binds `8080`. Use separate container network namespaces or extend
the listener configuration before demonstrating simultaneous local versions.

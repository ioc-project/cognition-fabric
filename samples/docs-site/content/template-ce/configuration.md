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
| `HEALTH_PORT` | `8081` | Health listener. Both `task run:template-ce` and `task run:template-ce:image` set 8082 because the SCOPE API uses 8081 |
| `COGNITION_STORE_URL` | Empty | SCOPE API base URL. Leave empty to skip findings I/O |
| `HTTP_PORT` | `8080` | Notification listener and advertised `notification_url` port |
| `ENABLE_NOTIFICATIONS` | `true` | Controls notification metadata included in registration |

`ENABLE_NOTIFICATIONS=false` omits notification metadata on a new registration and
clears the stored notification URL/endpoint on reconnect. It does not stop the
notification HTTP server from starting.
Do not use it to resolve a listener port collision. Invalid or unavailable health or
notification ports stop startup before gRPC and registration.

## Registration and health

Startup starts the health listener first, then gRPC and the notification listener, and registers with CFN
when `CFN_URL` is set. The registration advertises the gRPC enforcing address, service name, health URL
and optional notification metadata (`notification_url`, `notification_endpoint`, `notification_protocol`)
on both POST and PATCH. After register or PATCH the template pulls currently associated MAS IDs from
CFN, then stays current from notifications. CFN probes the advertised health URL; the template does
not replace these probes with heartbeats.

## Multiple local instances

Give each instance its own gRPC, health and notification ports (`GRPC_PORT`, `HEALTH_PORT`,
`HTTP_PORT`). Use separate container network namespaces when demonstrating simultaneous local versions.

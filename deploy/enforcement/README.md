# Enforcement (optional)

Optional enforcement flavors for the stack. The base stack already runs the
control plane (`ioc-scale-enforcement-proxy-mediation`, `ioc-scale-enforcement-proxy-ui`) and CF; this
directory adds one enforcement point in front of an application. Nothing here
starts unless you ask for it, so `make up` stays light.

| Flavor | What it runs | Use it when |
|--------|--------------|-------------|
| [`envoy/`](envoy/) | Envoy with the Go sidecar and traceparent Wasm filters, plus a test upstream | You mediate HTTP traffic (for example MCP or tool calls) |
| [`shadi/`](shadi/) | The Go sender-authorization API (verifier) | You gate agent-to-agent sends from trusted SHADi hosts over SLIM |

Pick one. Both talk to CF at `ioc-scale-cfn-svc:9003` and write audit records to
`ioc-scale-enforcement-proxy-mediation`, which the UI reads.

```bash
make up enforcement=envoy
make up enforcement=shadi
make down                    # covers both flavors and keeps volumes
```

Only one flavor can exist at a time: `make up` refuses to start one while the other's
containers are present, even stopped ones, and tells you to run `make down` first.
Each flavor needs config you provide;
`make up` stops early and says which file is missing:

- `envoy`: `enforcement/envoy/sidecar-spec.yaml`, copied from
  [`sidecar-spec.example.yaml`](envoy/sidecar-spec.example.yaml).
- `shadi`: `enforcement/shadi/config/` with `config.json`, `ca.crt`, `server.crt`
  and `server.key`. See [`shadi/README.md`](shadi/README.md).

Both files are gitignored. The `compose.yaml` in each directory is an overlay for
the main compose file, so you can also run it by hand from the repo root:

```bash
docker compose -f docker-compose.yml -f enforcement/envoy/compose.yaml up -d
```

## Services and containers

Each service has the same name as its container, `ioc-scale-<name>`.

| Service | Host port | Flavor |
|---------|-----------|--------|
| `ioc-scale-enforcement-proxy-envoy` | 9010, 9011, 9012 | envoy |
| `ioc-scale-enforcement-proxy-upstream` | none | envoy |
| `ioc-scale-enforcement-proxy-sidecar-installer` | none | envoy (runs once) |
| `ioc-scale-enforcement-proxy-wasm-installer` | none | envoy (runs once) |
| `ioc-scale-enforcement-proxy-shadi-verifier` | 9013 | shadi |

Use the service name with `make logs service=<name>`.

## Shared settings

All have defaults suited to the local stack; set them in `.env` to change them.

| Variable | Default | Meaning |
|----------|---------|---------|
| `CF_ENFORCEMENT_ADDRESS` | `ioc-scale-cfn-svc:9003` | CF gRPC endpoint |
| `CF_ENFORCEMENT_ALLOW_PLAINTEXT` | `true` | Local CF is plaintext; TLS is the client default |
| `CF_ENFORCEMENT_TIMEOUT` | `2s` | CF call deadline |
| `ENFORCEMENT_FAILURE_POSTURE` | `fail_closed` | What happens when CF cannot decide |
| `AUDIT_JOURNAL_ADDRESS` | `ioc-scale-enforcement-proxy-mediation:8081` | Where audit records go |
| `AUDIT_JOURNAL_ALLOW_INSECURE_LOCAL` | `true` | Plaintext journal; `ioc-scale-enforcement-proxy-mediation` must allow it too (`BFF_GRPC_ALLOW_INSECURE_LOCAL`) |
| `AUDIT_JOURNAL_QUEUE_CAPACITY` | `256` | In-memory queue for final audit records. Overflow is counted, never blocks enforcement |
| `MAX_MEDIATED_BODY_BYTES` | `1048576` | Largest body mediated |
| `AUDIT_CAPTURE_MAX_BYTES` | `65536` | Largest body captured for audit |
| `AUDIT_REDACT_PATTERNS` | token patterns | JSON array of regexes redacted from captured bodies |
| `ENFORCEMENT_PLATFORM` | `linux/arm64` | Architecture of every enforcement container. The Envoy plugin and Envoy must match, so this ignores `DOCKER_DEFAULT_PLATFORM`. Use `linux/amd64` on an Intel host |
| `ENFORCEMENT_SIDECAR_TAG`, `ENFORCEMENT_WASM_TAG`, `ENFORCEMENT_SHADI_TAG` | `latest` | Image tags (registry is `CF_REGISTRY`) |

The two plaintext flags are a local-development exception to mTLS. Do not use
them anywhere else.

Host ports, all on 127.0.0.1: Envoy `9010` (inbound), `9011` (outbound), `9012`
(admin); SHADi verifier `9013`. They are clear of the base stack and of the
proxy repo's own compose.

The configs here are examples taken from the `ioc-scaling-enforcement-proxy`
repo, which owns the filters, the verifier and the specs. Check its docs for the
authoritative field reference.

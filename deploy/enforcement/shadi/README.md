# SHADi flavor

The Go sender-authorization API. A trusted SHADi host calls `POST /evaluate`
before it sends an A2A message; the verifier maps the caller's certificate to a
registered host, checks the route, asks CF for a decision and writes an audit
record. Replies are reported to `POST /observations`. Only `allow` lets the send
proceed; everything else fails closed. The hosts themselves, and SLIM, run
outside this stack.

Run these commands from `deploy/`, with the monorepo root `.env` configured.

```bash
enforcement/shadi/gen-dev-certs.sh spiffe://ioc.example/hosts/sender spiffe://ioc.example/hosts/receiver
cp enforcement/shadi/config.example.json enforcement/shadi/config/config.json
# edit config.json, then:
make up enforcement=shadi
```

| File | Role |
|------|------|
| [`compose.yaml`](compose.yaml) | Overlay: the verifier on host port `9013` |
| [`config.example.json`](config.example.json) | Host registry and routes. Copy to `config/config.json` |
| [`gen-dev-certs.sh`](gen-dev-certs.sh) | Throwaway CA, server and per-host client certificates |

## `config/` directory

Mounted read-only at `/run/shadi-verifier`. It must hold `config.json`, `ca.crt`,
`server.crt` and `server.key`, readable by UID/GID 65532 (the image runs as
nonroot). `make up` checks that all four exist. mTLS is mandatory for
`/evaluate`, `/observations` and `/metrics`, local runs included.

`config.json` has two lists:

- `hosts`: one per trusted host, with `certificate_uri` (a SPIFFE URI that must
  match the URI SAN of that host's client certificate), `mas_id`, `agent_id`,
  `local_agent`, `did` (`did:key:...`) and `slim_name` (`org/namespace/agent`).
  Every identity must be unique.
- `routes`: `{ "source", "destination" }` pairs of `local_agent` names, same MAS,
  never to itself.

An invalid or ambiguous file is rejected at startup.

## Certificates

`gen-dev-certs.sh` writes the CA, a server certificate (valid for
`ioc-scale-enforcement-proxy-shadi-verifier`, `localhost` and `127.0.0.1`) and one client
certificate per URI you pass, named after its last path segment (`sender.crt`,
`sender.key`). Give each host its own client certificate and the CA. It never
overwrites existing files, and the certificates last 30 days by default
(`CERT_DAYS`). Development only. The server certificate must match the hostname
the hosts use to reach the verifier.

## Try it

```bash
make logs service=ioc-scale-enforcement-proxy-shadi-verifier
curl --cacert enforcement/shadi/config/ca.crt \
     --cert enforcement/shadi/config/sender.crt --key enforcement/shadi/config/sender.key \
     https://localhost:9013/metrics
```

Tested against the local stack: without a client certificate the connection is
refused, with the `sender` certificate `/metrics` returns 200, and `/evaluate` for a
MAS that CF does not know returns `deny` with HTTP 503 (fail closed). Register the
MAS in CF to get an allow.

Ports and shared variables are in [`../README.md`](../README.md). Override the
host port with `SHADI_VERIFIER_PORT`, and the config directory with
`SHADI_VERIFIER_CONFIG_DIR`.

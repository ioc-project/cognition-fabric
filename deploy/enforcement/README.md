# Enforcement (optional)

The platform starts CF, OXP, Demo CE and the published mediation compatibility
service. Add one optional proxy flavor through the existing Makefile interface:

| Flavor | Components | Configuration guide |
| --- | --- | --- |
| Envoy | Envoy, Go/Wasm installers and a diagnostic Nginx upstream | [Envoy setup](envoy/README.md) |
| SHADi | Private mTLS sender verifier; hosts/SLIM remain external | [SHADi setup](shadi/README.md) |

Run from the monorepo root after the platform prerequisites in
[`deploy/README.md`](../README.md). Follow the selected guide to prepare private
inputs before starting:

```bash
make -C deploy doctor enforcement=envoy
make -C deploy pull enforcement=envoy
make -C deploy up enforcement=envoy
make -C deploy status
make -C deploy logs service=ioc-scale-enforcement-proxy-envoy
make -C deploy down
```

Use `enforcement=shadi` for the other flavor. Only one flavor may exist at a time;
`up` refuses if the other's containers exist, even stopped installer jobs.
`status/logs/down` cover both flavors and all profiles. `down` preserves volumes.
`config/pull` work before private startup files exist. `doctor` checks inputs but
starts no containers; for Envoy it also prepares ignored bootstrap files.

Both current adapters call CFN directly for decisions and audit delivery. Neither
uses the base mediation service as a journal or activation controller. Mediation
keeps its BFF API, CFN audit persistence mode and loopback ports for existing clients.

This is component deployment. MAS attachment, identities, routes and controller
activation belong to the MAS developer. Default examples are unprovisioned and
reject protected traffic. `profile=full-mas` retains the existing NOA sample image;
it does not attach that sample to the proxy or migrate it to NOA A2A.

## Images and rollback

The maintained source is [ioc-project/enforcement-proxy](https://github.com/ioc-project/enforcement-proxy).
Its currently published images use `ghcr.io/cisco-eti`; a repository move does
not establish a new package namespace. All four proxy defaults are `latest`:

| Component | Package | Tag override | Full-reference override |
| --- | --- | --- | --- |
| Mediation | `ioc-scaling-enforcement-mediation` | `ENFORCEMENT_PROXY_MEDIATION_TAG` | `ENFORCEMENT_PROXY_MEDIATION_IMAGE` |
| Sidecar | `ioc-scaling-enforcement-proxy-sidecar` | `ENFORCEMENT_SIDECAR_TAG` | `ENFORCEMENT_SIDECAR_IMAGE` |
| Wasm | `ioc-scaling-enforcement-proxy-wasm` | `ENFORCEMENT_WASM_TAG` | `ENFORCEMENT_WASM_IMAGE` |
| SHADi | `ioc-scaling-enforcement-proxy-shadi-verifier` | `ENFORCEMENT_SHADI_TAG` | `ENFORCEMENT_SHADI_IMAGE` |

A full reference wins over `CF_REGISTRY` and the component's tag. Settings in an
existing root `.env` remain explicit overrides: for example an old
`ENFORCEMENT_PROXY_MEDIATION_TAG=0.0.1-alpha` still selects alpha until the operator
changes or removes it. The launcher never rewrites `.env`.

`make pull` explicitly refreshes selected images. Compose can also refresh
`latest` during `up`, even when cached; `up` adds no extra pull command. Select
full digest references to retain a known working release. Record the selected
image digests, compatible Envoy version, platform and private configuration
before updating. Treat sidecar/Wasm as a qualified pair. Example settings to fill
with recorded digests in root `.env`:

```dotenv
ENFORCEMENT_PROXY_MEDIATION_IMAGE=ghcr.io/cisco-eti/ioc-scaling-enforcement-mediation@sha256:<recorded-mediation-digest>
ENFORCEMENT_SIDECAR_IMAGE=ghcr.io/cisco-eti/ioc-scaling-enforcement-proxy-sidecar@sha256:<recorded-sidecar-digest>
ENFORCEMENT_WASM_IMAGE=ghcr.io/cisco-eti/ioc-scaling-enforcement-proxy-wasm@sha256:<recorded-wasm-digest>
ENFORCEMENT_SHADI_IMAGE=ghcr.io/cisco-eti/ioc-scaling-enforcement-proxy-shadi-verifier@sha256:<recorded-shadi-digest>
```

For a deliberate upgrade or rollback, run `make -C deploy down`, select the
compatible images and restore matching private configuration, then run
`doctor`, `pull`, `up` with the chosen flavor/profile. Volumes are retained.
An arbitrary old alpha image is not guaranteed to accept current configuration.
Envoy restarts after installer updates and is recreated after prepared content
changes; uninterrupted plugin upgrades are not a deployment guarantee.

## Services and settings

All host ports below bind to `127.0.0.1`.

| Service | Host ports |
| --- | --- |
| `ioc-scale-enforcement-proxy-envoy` | 9010 inbound, 9011 outbound, 9012 admin |
| `ioc-scale-enforcement-proxy-upstream` | none; diagnostic echo only |
| `ioc-scale-enforcement-proxy-sidecar-installer` | none; exits successfully after install |
| `ioc-scale-enforcement-proxy-wasm-installer` | none; exits successfully after install |
| `ioc-scale-enforcement-proxy-shadi-verifier` | 9013 |
| `ioc-scale-enforcement-proxy-mediation` | 9006 gRPC, 9005 HTTP; base service |

| Variable | Default | Purpose |
| --- | --- | --- |
| `CF_ENFORCEMENT_ADDRESS` | `ioc-scale-cfn-svc:9003` | CFN decision/audit endpoint |
| `CF_ENFORCEMENT_ALLOW_PLAINTEXT` | `true` | Explicit local plaintext transport |
| `CF_ENFORCEMENT_TIMEOUT` | `2s` | CF call deadline; SHADi requires below 4s |
| `ENFORCEMENT_FAILURE_POSTURE` | `fail_closed` | SHADi requires this value |
| `AUDIT_QUEUE_CAPACITY` | `256` | Bounded adapter audit delivery queue |
| `AUDIT_RPC_TIMEOUT` | `2s` | Audit delivery RPC deadline |
| `MAX_MEDIATED_BODY_BYTES` | `1048576` | Mediated body limit |
| `AUDIT_CAPTURE_MAX_BYTES` | `65536` | Audit capture limit |
| `AUDIT_REDACT_PATTERNS` | token patterns | JSON regex list for capture redaction |
| `ENFORCEMENT_PLATFORM` | `linux/arm64` | All optional flavor containers; use `linux/amd64` on Intel/AMD |

Mediation retains `BFF_*` transport/host-port settings; those are separate from
adapter audit delivery. Plaintext options are local development exceptions.
The [root environment template](../../.env.example) lists optional paths and
host-port overrides. Flavor guides describe read-only configuration mounts and
MAS-owner handoff; upstream owns the authoritative schemas.

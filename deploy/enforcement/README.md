# Enforcement (optional)

The platform starts CF, SCOPE, and Demo CE. Add one optional Proxy flavor through
the Makefile interface:

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
`status/logs/down` cover both flavors. `down` preserves volumes.
`task deploy:up` reads `DEPLOY_ENFORCEMENT` from root `.env`. Set it to
`envoy` or `shadi` to select an overlay, or leave it empty for the base stack.
`config/pull` work before private startup files exist. `doctor` checks inputs but
starts no containers; for Envoy it also prepares ignored bootstrap files.

Both adapters call CFN directly for decisions and audit delivery.

This is component deployment. MAS attachment, identities, routes and controller
activation belong to the MAS developer. Default examples are unprovisioned and
reject protected traffic. The [NOA A2A Task workflow](../../dev/README.md#noa-onboarding-and-proxy-mode)
starts its own Envoy and enrolls its MAS with the Proxy controller.

## Proxy images

The maintained source is [ioc-project/enforcement-proxy](https://github.com/ioc-project/enforcement-proxy).
The `PROXY_REGISTRY` setting defaults to `ghcr.io/ioc-project`. All three Proxy
image tags default to `latest`.

| Component | Package | Tag override | Full-reference override |
| --- | --- | --- | --- |
| Sidecar | `ioc-sidecar` | `ENFORCEMENT_SIDECAR_TAG` | `ENFORCEMENT_SIDECAR_IMAGE` |
| Wasm | `ioc-wasm` | `ENFORCEMENT_WASM_TAG` | `ENFORCEMENT_WASM_IMAGE` |
| SHADi | `ioc-shadi-verifier` | `ENFORCEMENT_SHADI_TAG` | `ENFORCEMENT_SHADI_IMAGE` |

A full reference takes precedence over `PROXY_REGISTRY` and the component's tag.
Settings in an existing root `.env` remain explicit overrides.

`make pull` explicitly refreshes selected images. Compose can also refresh
`latest` during `up`, even when cached; `up` adds no extra pull command. Select
full digest references to retain a known working release. Record the selected
image digests, compatible Envoy version, platform and private configuration
before updating. Treat sidecar/Wasm as a qualified pair. Example settings to fill
with recorded digests in root `.env`:

```dotenv
ENFORCEMENT_SIDECAR_IMAGE=ghcr.io/ioc-project/ioc-sidecar@sha256:<recorded-sidecar-digest>
ENFORCEMENT_WASM_IMAGE=ghcr.io/ioc-project/ioc-wasm@sha256:<recorded-wasm-digest>
ENFORCEMENT_SHADI_IMAGE=ghcr.io/ioc-project/ioc-shadi-verifier@sha256:<recorded-shadi-digest>
```

For a deliberate upgrade or rollback, run `make -C deploy down`, select the
compatible images and restore matching private configuration, then run
`doctor`, `pull`, `up` with the chosen flavor. Volumes are retained.
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

Plaintext options are local development exceptions.
The [root environment template](../../.env.example) lists optional paths and
host-port overrides. Flavor guides describe read-only configuration mounts and
MAS-owner handoff; upstream owns the authoritative schemas.

# Enforcement (optional)

The deployment Task supports two optional Proxy flavors. It starts CF and
SCOPE with the [selected CE](../README.md#quick-start), which defaults to
Template CE.

| Flavor | Components | Configuration guide |
| --- | --- | --- |
| Envoy | Envoy, Go/Wasm installers and a diagnostic Nginx upstream | [Envoy setup](envoy/README.md) |
| SHADi | Private mTLS sender verifier; hosts/SLIM remain external | [SHADi setup](shadi/README.md) |

Run from the monorepo root after the platform prerequisites in
[`deploy/README.md`](../README.md). Follow the selected guide to prepare private
inputs before starting:

```bash
DEPLOY_ENFORCEMENT=envoy task deploy:up
```

Use `DEPLOY_ENFORCEMENT=shadi` for the other flavor. You can also set
`DEPLOY_ENFORCEMENT` in root `.env` and run `task deploy:up`, or leave it empty
for the base stack. Run `task deploy:down` before switching flavors, even when
the other flavor only has stopped installers. Shutdown preserves volumes.

### Direct Make alternative

The Task calls the [deployment Makefile](../README.md#direct-make-alternative).
For direct Make, prepare the Demo CE policy along with the flavor's private
inputs. Use `enforcement=shadi` for SHADi.

```bash
make -C deploy doctor enforcement=envoy
make -C deploy pull enforcement=envoy
make -C deploy up enforcement=envoy
make -C deploy status
make -C deploy logs service=ioc-scale-enforcement-proxy-envoy
make -C deploy down
```

Only one flavor may exist at a time. `up` refuses if the other flavor's
containers exist, including stopped installer jobs. Run `make -C deploy down`
before switching. `status`, `logs`, and `down` cover both flavors. Shutdown
preserves volumes.

`config` and `pull` work before private startup files exist. `doctor` checks
inputs without starting containers and prepares the ignored bootstrap files
for Envoy.

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

`task deploy:up` refreshes selected images by default. For direct Make, use
`make -C deploy pull` with the chosen flavor to explicitly refresh its images.
Direct `up` uses Compose's pull policy, which can refresh `latest` even when the
image is cached. Select full digest references to retain a known working release.
Record the selected image digests, compatible Envoy version, platform and private
configuration before updating. Treat sidecar/Wasm as a qualified pair. Example
settings to fill with recorded digests in root `.env`:

```dotenv
ENFORCEMENT_SIDECAR_IMAGE=ghcr.io/ioc-project/ioc-sidecar@sha256:<recorded-sidecar-digest>
ENFORCEMENT_WASM_IMAGE=ghcr.io/ioc-project/ioc-wasm@sha256:<recorded-wasm-digest>
ENFORCEMENT_SHADI_IMAGE=ghcr.io/ioc-project/ioc-shadi-verifier@sha256:<recorded-shadi-digest>
```

For a deliberate upgrade or rollback, run `task deploy:down`, select the
compatible images and restore matching private configuration. Then run
`task deploy:up` with `DEPLOY_PULL=true` and the chosen `DEPLOY_ENFORCEMENT`
setting. With direct Make, run `make -C deploy down`, select the compatible
images and restore matching private configuration, then run `doctor`, `pull`,
and `up` with the chosen flavor. Both shutdown paths preserve volumes.

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

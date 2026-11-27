# Cognition Fabric samples

| Sample | Purpose |
| --- | --- |
| [demo-ce/](demo-ce/README.md) | Go CE with per-MAS identity and content policies |
| [template-ce/](template-ce/README.md) | Python reference CE with registration, health, and MAS notifications |
| [noa-trip-planner-a2a/](noa-trip-planner-a2a/README.md) | Native NOA A2A workload with Proxy enforcement and onboarding |
| [docs-site/](docs-site/README.md) | Docusaurus documentation for the CE samples |

The shared CE and Enforcement contracts live in [api/](../api/README.md).
Go samples depend on the local API module; Python bindings are generated from
those same canonical protos. No private CFN-module token or Vault setup is needed.

Run the complete local stack through the root tasks described in
[dev/README.md](../dev/README.md). Choose one CE at a time and associate the
registered, enabled, online CE with the test MAS.

From the monorepo root, the standalone sample Compose file remains available:

```bash
docker compose -f samples/docker-compose.yml up --build
```

Configure the Demo CE policy with the actual MAS and agent identities first.
Compose builds from the monorepo root and expects CFN/OXP to be reachable; stop
an existing CE instance manually before starting another on the same ports.

Root CI tests every component. The release dispatcher uses independent tags such
as `samples/demo-ce/v1.0.0` and `samples/template-ce/v1.0.0`; it publishes only the
selected image with the existing GHCR name. See [release instructions](../docs/releases.md).
One Pages artifact combines the docs site and Management API viewer.

New CE implementations should use the public [CE API guide](../api/README.md),
keep tests beside their component, and extend the root CI/build checks.

See the root [license](../LICENSE.md) and [third-party notices](../THIRD-PARTY-NOTICES).

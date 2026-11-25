# Cognition Fabric

Cognition Fabric (CF) connects multi-agent systems (MAS) to Cognition Engines
(CEs) for governance and enforcement. The Enforcement Proxy mediates configured
interactions and calls CF's Enforcement API for runtime decisions. Active APIs
for direct MAS engagement are planned.

The standard CF deployment includes the **System for Cognitive Observability,
Provenance and Explainability (SCOPE)**. SCOPE processes MAS telemetry, owns the
Cognition Store and serves the Analytics APIs that CEs call directly.

Read the [Cognition Fabric architecture](docs/architecture.md) for the component
diagram, API boundaries, and runtime flows.

- **CF Management** manages workspaces, MAS definitions, CE registrations, and
  configuration.
- **CF UI** provides the web interface for administration and audit inspection.
- **Cognition Fabric Node (CFN)** exposes runtime APIs, routes enforcement
  requests to CEs, probes their health, and sends MAS lifecycle notifications.

The monorepo builds six container images. CF Management, CF UI, and CFN each
have an application image. The [Go Demo CE](samples/demo-ce/README.md) shows a
working policy engine, and the [Python Template CE](samples/template-ce/README.md)
provides a starting point for a new CE. The sixth image,
[`ioc-scale-db`](deploy/docker-db/README.md), provides the shared PostgreSQL
database server for CF and SCOPE in the [deployment stack](deploy/README.md).

## Repository layout

| Folder | Purpose |
| --- | --- |
| [api/](api/README.md) | CE, Enforcement, and Management contracts and generated bindings |
| [cfn/](cfn/README.md) | Cognition Fabric Node runtime |
| [cf-mgmt/](cf-mgmt/README.md) | Management API and configuration storage |
| [cf-ui/](cf-ui/README.md) | Management user interface |
| [samples/demo-ce/](samples/demo-ce/README.md) | Go policy-driven Cognition Engine |
| [samples/template-ce/](samples/template-ce/README.md) | Python reference Cognition Engine |
| [samples/noa-trip-planner/](samples/noa-trip-planner/README.md) | Source NOA integration driver and MAS declarations |
| [samples/docs-site/](samples/docs-site/README.md) | CE documentation site |
| [dev/](dev/README.md) | Local launchers, Compose overrides, and development checks |
| [deploy/](deploy/README.md) | Shared Compose stack, enforcement overlays, and database image source |
| [docs/](docs/README.md) | CF-wide architecture, decisions, contracts, and operating guidance |

Run `task test`, `task check`, `task infra:up`, and `task run:*` from this root.
Start with [fresh checkout setup](dev/README.md#fresh-checkout) for prerequisites,
source/image modes, and ports.
The local stack uses the deployment assets in [deploy/](deploy/README.md).
Do not run a second copy of an already-running service.

Components are versioned independently with folder-prefixed tags. See the
[release procedure](docs/releases.md) and [API audience guide](api/README.md).

Track issues in the [CF issue tracker](https://github.com/ioc-project/cognition-fabric/issues).

## License and attribution

Licensed under [Apache-2.0](LICENSE.md). See [THIRD-PARTY-NOTICES](THIRD-PARTY-NOTICES)
for complete component-specific attribution.

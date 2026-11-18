# Cognition Fabric

Cognition Fabric provides the management plane, node runtime, and CE/enforcement
contracts used to govern multi-agent systems. The shared stack is configured in
`deploy/`; OXP remains an external integration.

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

Track issues in the [CF issue tracker](https://github.com/cisco-eti/ioc-scale-cfn-svc/issues).

## License and attribution

Licensed under [Apache-2.0](LICENSE.md). See [THIRD-PARTY-NOTICES](THIRD-PARTY-NOTICES)
for complete component-specific attribution.

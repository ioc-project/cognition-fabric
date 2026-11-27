# Management documentation

The canonical Management API schema is
[`api/mgmt/openapi/openapi.json`](../../api/mgmt/openapi/openapi.json).
It retains the existing OpenAPI 3.0.0 export format. Internal CFN registration,
heartbeat and CE synchronization operations carry `x-internal` and `x-callers`
annotations in this documentation artifact.

From `cf-mgmt/`, run `task generate-openapi-spec` to regenerate it and
`task check-openapi-spec` to compare without changing files. Generation imports
route definitions without starting the application lifespan, loading private
`.env` settings, or connecting to a running service. Runtime documentation remains
at `/api/docs`, `/redoc`, and `/api/openapi.json` on Management's HTTP listener.

The [MAS onboarding contract](../../api/mgmt/docs/MAS_METADATA.md) describes rich
snapshots and atomic validation. The [database migrations guide](DATABASE_MIGRATIONS.md)
covers schema authoring and automatic migration application at startup.

See [the root contribution guide](../../CONTRIBUTING.md) for project-wide checks.

# Management development

Management source lives in `cf-mgmt/` within the Cognition Fabric monorepo.
The [Management README](../../README.md) describes this component; the
[local workflow](../../../dev/README.md) covers shared configuration,
infrastructure and service startup. Use the root `.env.example` and `.env`.

## Development commands

Run these from the repository root after completing the local prerequisites:

```bash
(cd cf-mgmt && poetry install)
task run:cfn-mgmt
task test
```

The launcher applies pending Alembic migrations at startup. Root `task test`
checks the database target before running Management tests against `ioc_test`.
See the [database migrations guide](../DATABASE_MIGRATIONS.md) for schema authoring.

Run component lint and API schema commands from `cf-mgmt/`:

```bash
task lint-check
task check-openapi-spec
task generate-openapi-spec
```

## Contracts and related code

- [Management documentation](../README.md) indexes API and database guidance.
- [Shared API contracts](../../../api/README.md) include the canonical
  [Management schema](../../../api/mgmt/openapi/openapi.json) and
  [MAS onboarding contract](../../../api/mgmt/docs/MAS_METADATA.md).
- UI source lives in [cf-ui/](../../../cf-ui); coordinate API changes with its
  generated types and the shared schema checks.
- Authorization policies live in [src/server/authz/](../../src/server/authz),
  with [RBAC tests](../../tests/test_authz_rbac.py) and
  [implementation notes](RBAC-IMPLEMENTATION.md).
- Follow the [root contribution guide](../../../CONTRIBUTING.md) and
  [architecture](../../../docs/architecture.md) for changes across components.

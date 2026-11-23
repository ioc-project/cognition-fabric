# Contributing to Cognition Fabric

Read the [root README](README.md), [local setup](dev/README.md), and component README
before changing a service. Run the root `task test` and `task check` aggregates.
API changes also require regeneration and the compatibility/drift checks.

Keep public contracts under `api/`, project documentation under `docs/`, and local
development tooling under `dev/`. Preserve frozen legacy protobuf fixtures.
Components have independent versions; update the release compatibility table when
publishing a new combination.

Keep environment files, generated proxy credentials and runtime logs out of commits.

Use signed-off commits and pull requests for submitted changes.

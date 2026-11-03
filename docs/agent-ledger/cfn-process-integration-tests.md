# CFN process-level integration tests

**Scope:** `ioc-scale-cfn-svc` process-level tests in `test/integration/` (`//go:build integration`).
**Guidance:** Run them with `task test:integration` only. Do not fold them into `make test` or `task test`. Locally the Taskfile starts a throwaway Postgres 17 container on `127.0.0.1:55432` via `test/integration/compose.yaml` (same `localdev` / `cfn_audit_test` credentials as CI unit tests). GitHub Actions supplies `services.postgres` and sets `INTEGRATION_SKIP_DB=true` so Compose is not used in CI. Do not call `task infra:up`.

The suite starts CFN with `go run ./cmd/cfn` and mocks neighbors at the network edge (management HTTP, CE gRPC Evaluate, CE HTTP health/notification). Do not introduce production Go interfaces or DI just for these tests, and do not use `database.MockDatabase`: `go run` always uses GORM Postgres.

Management snapshot engines use JSON `id`; live `GetMAS` engines use `ce_id`. Sad-path management errors that would be retried as 5xx should be simulated with 4xx (or a 201 with invalid JSON for register parse failure). GET MAS for an unknown `mas_id` is 503 (`workspace not configured`) when the snapshot does not assign that MAS; 404 only happens when the snapshot has the MAS and GetMAS itself 404s.

**Why:** Process-level coverage of `initializeRoutes()` and `GetDisposition` needs a real CFN process and real Postgres. In-process mocks cannot exercise `cmd/cfn` env loading, heartbeat-driven config refresh, or jsonb audit writes.
**Evidence:** Agreed CF plan in this workspace; `Taskfile.yml` `test:integration`; `.github/workflows/ci.yaml` `integration` job; `test/integration/`. Related: [cfn-svc #47](https://github.com/cisco-eti/ioc-scale-cfn-svc/issues/47).
**Revisit when:** CFN gains a supported in-process test binary, management contracts change the `id` / `ce_id` split, or CI Postgres setup changes.

# CFN process-level integration tests

**Scope:** `ioc-scale-cfn-svc` process-level tests in `test/integration/` (`//go:build integration`).
**Guidance:** Run them with `task test:integration` only. Do not fold them into `make test` or `task test`. Locally the Taskfile starts a throwaway Postgres 17 container on `127.0.0.1:55432` via `test/integration/compose.yaml` (same `localdev` / `cfn_audit_test` credentials as CI unit tests) and tears it down with a Task `cmds` `defer` after the suite. GitHub Actions supplies `services.postgres` and sets `INTEGRATION_SKIP_DB=true` so Compose is not used in CI. Do not call `task infra:up`. A task-level `defer:` key is ignored; cleanup must be a `cmds` entry.

The suite starts CFN with `go run ./cmd/cfn` and mocks neighbors at the network edge (management HTTP, CE gRPC Evaluate, CE HTTP health/notification). Do not introduce production Go interfaces or DI just for these tests, and do not use `database.MockDatabase`: `go run` always uses GORM Postgres.

Management snapshot engines use JSON `id`; live `GetMAS` engines use `ce_id`. Sad-path management errors that would be retried as 5xx should be simulated with 4xx (or a 201 with invalid JSON for register parse failure). GET MAS for a `mas_id` that is not in the snapshot is 404 (`MAS not found`), matching GetDisposition; 503 is for an unloaded snapshot (`config snapshot unavailable`) or a missing management URL. A snapshot that contains the MAS but GetMAS itself 404s is also 404.

**Why:** Process-level coverage of `initializeRoutes()`, `GetDisposition`, and `AppendAuditRecord` needs a real CFN process and real Postgres. In-process mocks cannot exercise `cmd/cfn` env loading, heartbeat-driven config refresh, or jsonb audit writes. Proxy records use `source=PROXY`, `audit_type=PROXY_MEDIATED`, and the shared `outcome` field; CFN disposition records use `source=CFN`.
**Evidence:** Agreed CF plan in this workspace; `Taskfile.yml` `test:integration`; `.github/workflows/ci.yaml` `integration` job; `test/integration/`. Related: [cfn-svc #47](https://github.com/cisco-eti/ioc-scale-cfn-svc/issues/47).
**Revisit when:** CFN gains a supported in-process test binary, management contracts change the `id` / `ce_id` split, or CI Postgres setup changes.

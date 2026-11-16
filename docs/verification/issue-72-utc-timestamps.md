# Issue #72 UTC timestamp verification

Verification snapshot recorded before publication on 2026-11-11. The reviewed
implementation spans Management, CFN and UI on `fix/utc-timestamps`. The existing
staged plan was preserved during verification. Manual browser inspection remains
unverified.

See the [timestamp contract](../specs/utc-timestamps.md) for current behavior.

## Checks performed

| Repository | Actual result |
| --- | --- |
| Management | Full `pytest tests/ -q`: **507 passed**; final focused UTC/API/one-off and migration suites: **11 passed** |
| Management | Black, Flake8, generated OpenAPI parity and whitespace checks passed |
| CFN | `make test` and `make lint` passed; real PostgreSQL audit checks executed |
| CFN | `task test:integration`: **50 passed, 0 skipped**, including both regeneration/restart orderings and subsequent genuine notifications |
| CFN | Focused verbose audit serialization/database rerun: **2 passed**, no database skip |
| UI | `npm test`: **68 passed**; lint, TypeScript and production build passed |
| Local image configuration | Compose configuration validated using `.env.example` and explicit fixture mount paths |

Management tests used `TZ=America/Los_Angeles`, `PGTZ=Europe/Budapest`,
`PYTHON_DOTENV_DISABLED=1`, `PYTHONPATH=src` and explicit disposable database
settings. The installed Poetry virtual environment was invoked directly using
`.venv/bin/python -m pytest`. The full suite reported 42 dependency deprecation
warnings; the final focused run reported one. OpenAPI was regenerated with the
existing script and compared with the application's generated schema.

CFN tests and process integrations used `TZ=America/Los_Angeles` and explicit
disposable database settings. `INTEGRATION_SKIP_DB=true` retained the test server
while Management checks were using it. The focused audit rerun explicitly
confirmed database execution rather than relying on tests that could skip when
PostgreSQL is unavailable.

UI helper tests also ran child processes in UTC, America/New_York and
Asia/Kolkata. They cover explicit offsets/fractions, invalid and naive values,
UTC labels, optional display timezone, relative times, sorting and preserved
audit formats. No direct `date-fns` imports remain; its transitive dependency is
retained.

## PR CI coverage follow-up

Compared the PR-triggered workflows in all three repositories with the checks
above and completed the missing local equivalents. Every blocking repository
PR check has a passing local result. These are local checks; GitHub-hosted
Actions results are reported separately on the PRs.

| Repository | PR checks covered |
| --- | --- |
| Management | The existing 507-test run covers `scripts/unit-test.sh`; exact nonmutating `bash scripts/lint.sh --check` passed; Dockerfile build passed for `linux/amd64` |
| CFN | Unit tests, lint and 50 process integrations passed; `make proto-check` and `make docs-check` now passed; Dockerfile build passed for `linux/amd64` |
| UI | Fresh `npm ci`, all 68 tests, `npm run lint:check`, `npx tsc --noEmit` and `npm run build` passed under Linux amd64 Node 20.20.2/npm 10.8.2; PR Dockerfile build passed for `linux/amd64` |

CFN protobuf freshness used CI's compiler 35.1, `protoc-gen-go` v1.36.12 and
`protoc-gen-go-grpc` v1.6.2. Swagger used the same `swag@latest` installation
command as CI. Neither check changed generated files. Management's check-only
lint is equivalent to CI's formatter/linter without rewriting source.

UI's dependency audit completed with 25 findings: 3 low, 12 moderate, 9 high
and 1 critical. The critical package is `next@16.3.1`. The workflow explicitly
makes this audit nonblocking with `|| true`; the audit is not clean. No locked
package version changed relative to the reviewed base: this implementation only removes
the unused root `date-fns` development dependency declaration.

Fresh UI checks and image builds used temporary source snapshots containing the
reviewed implementation and new tests, with private environment and
ignored runtime files excluded. The original UI `node_modules`/`.next` and the
running stack were untouched. Images were built locally with no push, registry
login, Docker prune, or service restart:

- `ioc-scale-cf-mgmt-svc:pr-ci-local`
- `ioc-scale-cfn-svc:pr-ci-local`
- `ioc-scale-cf-ui:pr-ci-timestamps`

The UI image used the PR's `ci/docker/Dockerfile.next` and default
`CFN_UI_API_BASE_URL=http://localhost:9000`. Tag-only release checks, Pages
publication and main-branch image publication are not PR validation steps.

## Boundaries verified

- Migration upgrade/downgrade converts only the 19 columns, preserves aware
  columns and cache JSON/versions, validates the legacy zone, rejects offline
  mode and preserves connection options/search paths. Ordinary UTC and Budapest
  summer/winter conversions, nulls, microseconds, rollback and repeat upgrade
  were exercised against PostgreSQL.
- Checked one-off regeneration covers enabled and disabled non-deleted CFNs,
  excludes archived caches, verifies coverage/stamps and detects swallowed or
  incomplete generator results. MAS freshness and opaque CE evidence survive.
- CFN default/expanded MAS handling and CE protobuf files remain unchanged.
  Owned audit stamps serialize as UTC while CE evidence stays opaque.
  Equivalent timestamp spellings produce no lifecycle notification; actual
  changes still notify with the existing payload shape.

Same-context diff review and a fresh clean-context read-only review completed
with no unresolved findings. The independent reviewer inspected code, tests,
generated artifacts and documentation; it did not rerun runtime checks.

## Live API verification and remaining manual checks

The initial automated database suites used only the disposable
`cfn-integration-postgres` server on `127.0.0.1:55432`, with separate
`cfn_audit_test` and `ioc_test` databases. That container was removed afterward.

The user subsequently restarted source Management through `task run:cfn-mgmt`.
Its startup applied `mas_metadata_0009 -> utc_timestamps_0010` to
`cfn_mgmt_local`. Read-only inspection confirmed the revision and all 19 aware
columns, plus matching database/config/API timestamps for test MAS
`22aa32b8-e1a0-49bb-8d61-997317b81f47`.

With explicit user permission, normal Management PUT requests temporarily
changed that MAS's description and then restored its original value:

| Action | UTC update time on 2026-11-11 | Config version |
| --- | --- | --- |
| Temporary description edit | `09:30:06.997161Z` | 398 |
| Restore original description | `09:30:22.212063Z` | 399 |

Both requests returned HTTP 200. Each update instant matched its actual UTC
request window, database epoch, cached `updated_at`/`last_updated_on` and
Management/expanded CFN output. Creation time, unrelated MAS content and CE
memberships stayed unchanged. The default CFN response still omitted timestamps.
The original description was confirmed restored, and CFN remained healthy.

Live notification delivery remains unconfirmed: foreground logs were not saved,
and OS permissions prevented passive loopback capture. No NOA execution was
triggered by the configuration-only test. Non-UTC browser screen inspection and
rebuilt container-image execution also remain unverified; the image checks above
built images without starting them. These checks do not replace the user's
manual review.

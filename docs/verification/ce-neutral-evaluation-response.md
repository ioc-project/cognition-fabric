# CE response compatibility verification

Date: 2026-11-04, Europe/Budapest. Local implementation remains uncommitted.
CFN implementation base: `712c939` (merged PR #46), with approved plan commit
`ad750f8`. Sample base: `d6166c3`. Branch in both: `feat/ce-neutral-evaluation-response`.

The live runs recorded below preceded the audit envelope rename; their stored
`ce_details` JSON is historical evidence and remains unchanged. See the rename
follow-up below for the current `ce_response` writer and verification.

## Existing-image gate

The published image was pinned without pulling or rebuilding:

```text
ghcr.io/cisco-eti/ioc-scale-cf-demo-ce/demo-ce@sha256:eea18a9558b27bb02d07c1fc98fdcb1e8d733e80f4534231ac7fd4fe33aea71f
```

Its reflected EvaluateResponse has fields 1–9 and no `details`. Go build metadata
from its unchanged binary reports Go 1.25.14 and CFN dependency
`v0.0.0-20261002175228-d7525b9bf322`. This is independent of the local module
replacement and updated bindings.

Built baseline CFN before changing its proto. Then ran the same image against
baseline CFN, contract-updated CFN, and the final CFN with audit safeguards, in
that order. Both samples were updated only after the contract-updated CFN passed.

Local setup required applying Management's already-merged migration 0007: its
running code had reloaded the new models while `cfn_mgmt_local` was still at 0006,
making MAS lookup return HTTP 500. The existing migration completed successfully;
registration/ownership recovered after the CE restart. No databases or volumes
were reset. Test audit storage uses the separate `cfn_audit_ce55_test` database.

The policy has three configured identity ALLOW rules and no content rules. For
MAS `3c0a54c0-d675-4660-919d-dddd01b8d6e3`, source `schedule_agent`:

| Route | CE result and actual reason | CFN result |
| --- | --- | --- |
| `list_documents` | ALLOW; `Allow schedule_agent to call its configured NOA tools` | ACTION_ALLOW, modify false |
| `ce55_unconfigured_tool` | DENY; `Source and destination are outside approved routes` | ACTION_BLOCK, modify false |

All three CFN builds retained those decisions/reasons. The image returned its
existing legacy diagnostics and no details. Audits were read through Management,
with selected CE `827cba44-1b8a-4e1c-8fe9-9b8f9a2883db` and success true for both
policy outcomes. Reads waited for a fresh event ID, avoiding a prior replay's row.

| Case | Reused trace ID | Baseline audit ID | Final-CFN audit ID |
| --- | --- | --- | --- |
| ALLOW | `6a7fd538afa140c18e5c95782ac70a29` | `4f3deb22-ea7f-4120-b428-67c748207fc6` | `afbb88bf-9480-42bc-a863-9ae7330d79b0` |
| DENY | `aa6b5eeeee3f4670926166341e30870e` | `264f6e12-0b10-431e-af12-1ab6875f60cc` | `bb74513c-bf36-4074-9bc3-aa0aa1fd73da` |

## Updated samples

Direct Evaluate calls used both the current proto and the frozen old proto.
The current client received the sample's schema object with all four deprecated
wire diagnostics absent. The frozen client ignored details and decoded the same
outcome/reason/metadata. GetDisposition used real Management inventory and the
intended CE; fresh audit rows contained `ce_details.details` with that schema.

| Sample case | Returned action | Trace ID | Audit ID |
| --- | --- | --- | --- |
| Go Demo CE ALLOW, `demo-ce.v1` | ACTION_ALLOW | `0e7f55e252574d52a6a0eb8053fad76a` | `611ae8b6-49a2-4bb6-846f-d9d6671dced4` |
| Go Demo CE DENY, `demo-ce.v1` | ACTION_BLOCK | `f48bb8c61cad42dfba841b52c640ef92` | `907baab3-9e4d-4170-bb46-b97d8047138e` |
| Template CE forced ALLOW, `template-ce.v1` | ACTION_ALLOW | `6be0a3977a0c45169259a9ceadca51a8` | `0cd3a382-9998-41c5-bc75-a579f4179f3b` |
| Template CE forced DENY, `template-ce.v1` | ACTION_BLOCK | `4bb93d7aa1dd45ae85874bf1b4156ac5` | `a8a198bc-8d12-4ace-b6d3-21684ebda76c` |

Template selected CE was `313a23ef-c4a8-40aa-9b0e-bc3bf8402537`; Go Demo CE used the
same ID as the image. Template reasons remained the configured demo policy reasons.
Both samples ran against the existing OXP service; findings behavior remained active.
Afterward, restored source CFN and source Go Demo CE, stopped the image and Template
CE, and confirmed Demo CE online and Template offline. The updated source binaries
are running on the original service ports. Logs and detailed live results for this
session are under `/private/tmp/cf-ce55-runtime/` and may be removed by the OS.

## Automated checks performed

- CFN: `go test ./...`, then affected-package checks after adding the final legacy
  server and storage assertions. All passed with local socket access enabled.
- `TestGetDispositionWithFrozenLegacyServer` uses a private frozen descriptor pool
  and real gRPC for ALLOW, DENY, MODIFY, unknown 99 and omitted/default outcomes.
  It verifies existing action/modify mapping and retained successful audits.
- Frozen binary/schema tests verify existing field/tag/type and enum/service/request
  contracts, old-to-new decoding, new-to-old decoding, absent/empty/nested details,
  and default-presence loss through an old encoder.
- Audit tests cover NaN/±Inf, recursive NUL keys/values, retained literal escape text,
  snapshots, explicit UNSPECIFIED versus omission, below/exact/above 16 KiB,
  escaping overhead, empty check slices, encoding errors and terminal fallback.
- GetDisposition regressions use gRPC responses with invalid/oversized diagnostics
  and assert unchanged BLOCK/modify behavior plus the complete core audit event.
- `TestSpecificDetailsPostgresJSONBRoundTrip` exercised actual PostgreSQL jsonb,
  including NUL keys/values/nesting and exact retained literal-escape/nested data.
  It was rerun verbosely to confirm execution rather than a skipped database test.
  These tests truncate only their isolated test database's audits table.
- Go Demo CE: `go test -mod=mod -modfile=<temporary>/demo.mod ./...` passed, then the
  engine suite passed after the final frozen-consumer regression was added.
- Template CE: `.venv/bin/python -m pytest -q`: **46 passed**, with two existing
  aiohttp bare-function deprecation warnings.
- Python generation freshness: `python scripts/generate_proto.py --check` passed.
- CFN generation freshness passed using protoc 35.1 (the locked Python compiler),
  protoc-gen-go v1.36.12 and protoc-gen-go-grpc v1.6.2. Enforcement generated files
  remained unchanged.

Initial sandboxed socket tests failed to bind; rerunning with the required local
socket permission passed. A first legacy round-trip assertion incorrectly compared
dynamic messages from different descriptor pools; it was corrected to use the same
private descriptor for both messages. Neither failure represented a wire regression.

Self-review and an independent clean-context read-only diff review completed with
no actionable findings. The independent reviewer inspected code and evidence without
rerunning tests. User manual verification remains pending.

## Reproduce the checks

Supply the usual local POSTGRES_HOST/PORT/USER/PASSWORD/SSLMODE environment and a
dedicated `POSTGRES_TEST_DB=cfn_audit_ce55_test`, then run `go test ./...` from CFN.
The existing database test helper skips when the database is unavailable, so confirm
the verbose `TestSpecificDetailsPostgresJSONBRoundTrip` result has no SKIP entries.
Do not point this variable at an application database.

With the matching Go plugins on PATH, the compiler used here can be selected with:

```bash
make PROTOC='../ioc-scale-cf-demo-ce/template-ce/.venv/bin/python -m grpc_tools.protoc' proto-check
```

Run the sample suites using [Demo CE's temporary modfile instructions](https://github.com/cisco-eti/ioc-scale-cf-demo-ce/blob/main/demo-ce/README.md#evaluation-response-and-local-contract-development)
and Template CE's `.venv/bin/python -m pytest -q` / generator freshness command.

For live image checks, stop the source Demo CE first. Keep source CFN and local
Management/OXP running. Write this temporary override:

```yaml
services:
  ioc-scale-cf-demo-ce:
    image: ghcr.io/cisco-eti/ioc-scale-cf-demo-ce/demo-ce@sha256:eea18a9558b27bb02d07c1fc98fdcb1e8d733e80f4534231ac7fd4fe33aea71f
```

From CFN, with that file at `/private/tmp/ce55-legacy-image.yaml`:

```bash
CF_LOCAL_CE_CONFIG_FILE="$PWD/tmp/policy.json" \
CF_LOCAL_CE_MAS_FILE="$PWD/tmp/images/mas-id" CF_LOCAL_CE_HOST=127.0.0.1 \
COMPOSE_IGNORE_ORPHANS=true docker compose --project-directory "$PWD" \
  -p ioc-scale-cf-deployment --env-file .env \
  -f deploy/local/images/compose.yaml -f /private/tmp/ce55-legacy-image.yaml \
  up -d --no-deps --pull never ioc-scale-cf-demo-ce
```

Verify the registered CE is enabled/online and the only eligible CE for the test
MAS. Capture its old descriptor with `grpcurl -plaintext localhost:18001 describe
ioc.ce.v1.EvaluateResponse`. Invoke Evaluate explicitly with the frozen schema:

```bash
grpcurl -plaintext -import-path pkg/api/ce/v1/testdata/legacy -proto ce.proto \
  -d '{"mas_id":"3c0a54c0-d675-4660-919d-dddd01b8d6e3","source_agent_id":"schedule_agent","destination_agent_id":"list_documents","trace_id":"6a7fd538afa140c18e5c95782ac70a29","span_id":"6d3accc727e642fe"}' \
  localhost:18001 ioc.ce.v1.CognitionEngine/Evaluate
```

Use the same payload wrapped in `{"payload": ...}` with the Enforcement proto and
`localhost:9003 ioc.cf.enforcement.v1.Enforcement/GetDisposition`. Repeat with the
unconfigured destination above for DENY. Read `/api/audit-events/?pageSize=100`
through Management and `/api/internal/mgmt/audit?pageSize=100` through CFN; identify
the newly created event by trace and an ID absent before the request. Preserve
the selected CE and original correlation in assertions.

Stop the image, run updated Demo CE via `task run:demo-ce`, and repeat with both
frozen and current (`api/proto/ce/v1/ce.proto`) schemas. Then stop it and use
`task run:template-ce` for forced allow/deny, restarting between modes and checking
CE selection. Use port 50051 for direct Template calls. Restore the initial source
service arrangement afterward. These checks do not require rebuilding an old CE.

## Audit envelope rename follow-up

The user approved naming the captured audit response `ce_response`. New records
use `audit_information.ce_response` for both unchanged legacy CEs and updated CEs;
the latter's arbitrary data is at `ce_response.details`. The protobuf field
`EvaluateResponse.details` and all CE wire contracts are unchanged. Go names now
use `CEResponse`, `MaxCEResponseBytes` and `boundCEResponse`; new omission markers
use `ce_response.*` paths.

Historical rows retain `ce_details`, including original omission paths. The audit
entity/table and JSONB column are unchanged; no database migration or historical
data update is needed. The UI on the user-selected `feat/audit-upgrades` branch
types both field names and accepts arbitrary JSON data in the nested `details`.
Its existing JSON renderer continues displaying the stored shape directly.

Checks performed after the rename:

- Full CFN `go test ./...` passed with local sockets and the isolated PostgreSQL
  test database. Existing invalid-data, size, presence and legacy-wire checks pass
  with the new envelope and marker names.
- `TestCaptureResponseEnvelopeJSONName` verifies that new records from both legacy
  and updated CEs contain `ce_response` and never emit `ce_details`.
- `TestAuditResponseEnvelopePostgresHistory` inserts old/new JSON in the isolated
  test database and verifies Get/List preserve each shape, including historical
  `ce_details.timestamp` omission paths. Application records are not rewritten.
- UI `tsc --noEmit --incremental false`, targeted ESLint and Prettier checks passed.
- Same-context review and an independent read-only review found no actionable
  issues in the rename scope. These reviews do not replace user verification.

No live service was restarted for this rename. The running CFN needs to be stopped
with Ctrl+C and relaunched with `task run:cfn` before new application records use
the new key. The earlier live-image/sample evidence above is not claimed as a live
test of the renamed field.

## Generation tooling follow-up

The setup instructions now require protoc 35.1, protoc-gen-go v1.36.12 and
protoc-gen-go-grpc v1.6.2, and show the sibling Template CE compiler alternative.
`proto-check` compares the `.pb.go` file list under `pkg/api` as well as contents,
without changing the working tree. CI installs the pinned compiler/plugins,
verifies the official Linux compiler archive's SHA256 and checks freshness before
building or publishing an image.

Checks performed for this follow-up:

- Freshness passed with both the official native macOS arm64 protoc 35.1 and
  Template CE's locked `grpc_tools.protoc`, using the pinned Go plugins. Both
  compilers reproduce the checked-in `v7.35.1` generated version headers.
- Temporary fixtures verified matching output passes while modified, missing or
  extra generated files fail. A newly added proto targeting a new package fails
  until its output exists locally; present untracked output is checked for both
  filenames and content. Handwritten Go files are ignored, and compiler failures
  fail the check. All eight cases passed.
- The official Linux compiler archive was downloaded and its SHA256 and ZIP
  integrity verified. Its Linux executable was not run on the macOS host.
- CI YAML parsed successfully, and both image jobs' freshness dependencies were
  checked. The GitHub-hosted job itself has not been run.
- `git diff --check`, same-context review and an independent read-only review
  passed with no actionable findings. User manual verification remains pending.

## Four-repository artifact and CI verification

The follow-up sweep covered all four CF-owned repositories. Management remained
on clean `main`; UI remained on the user-selected `feat/audit-upgrades` branch.
Deployment and OXP checkouts were not changed.

| Repository | Generated artifacts | Local CI checks |
| --- | --- | --- |
| CFN service | Regenerated CE/Enforcement Go bindings and Swagger JSON/YAML/Go; existing output remains current. Regenerated the local NOA Enforcement Python binding with protoc 35.1. | Lint, coverage tests using isolated PostgreSQL, Swagger/protobuf freshness and Linux amd64 image build passed. |
| Management | Ran the OpenAPI generator from current application source; `docs/openapi/openapi.json` is byte-identical. Exported the runtime OpenAPI schema for UI generation. | Black/Flake8, all 390 tests and the Linux amd64 image build passed. |
| CF UI | Regenerated `schema.d.ts` from the freshly exported Management runtime schema using openapi-typescript 7.13.0 and the normal copyright-header step; byte-identical. | Clean Node 20 install, whole-repository lint/format, type checking, production build and Linux amd64 image build passed. |
| CE samples | Template CE's proto exactly matches CFN's CE proto. Regenerated its Python bindings and verified freshness. Frozen legacy fixtures were not regenerated. | Template CE: 46 tests passed. Go Demo CE vet/tests passed with the local CFN modfile override. The Node 22 documentation build passed. Standalone Go vet and Docker build fail against the old CFN module pin, as described below. |

The NOA Python regeneration changes its generated runtime version from 6.32.1 to
7.35.1. Its serialized wire descriptor is byte-identical, and the file imports with
NOA's locked protobuf 7.36.2. `make proto` now synchronizes its proto copy from the
canonical Enforcement contract and regenerates this binding; `make proto-check`
checks both. Native and Python protoc 35.1 freshness checks passed. Ten temporary
regression cases cover current/missing/extra/changed Go outputs, untracked outputs,
compiler failure and stale NOA proto/Python files. All passed.

Management tests ran against a separate temporary PostgreSQL container, which was
removed afterward. Application databases and running source/image services were
not restarted or changed. Node and Docker builds used isolated working-tree copies.

UI's advisory `npm audit` reported 38 dependency vulnerabilities: 3 low,
21 moderate, 13 high and 1 critical. Its workflow explicitly makes this scan
nonblocking. This feature has no UI dependency or lockfile changes.

The Go sample's ordinary Docker build was also attempted with its existing
published module pin and failed at compilation on scalar/optional enum type
differences, matching standalone vet. This is a real publication/pinning gate;
local override results do not establish standalone CI success. GitHub Actions,
registry publication and documentation deployment were not triggered.

Same-context review and an independent read-only review of the added generation
coverage found no actionable issues. User manual verification remains pending.

## Remaining limits

- Actual CASA and other real CE binaries were not available for a live test.
  The unchanged published Demo CE, its old CFN module, frozen bindings and private
  schema/gRPC tests provide the recorded interoperability evidence; they do not
  establish complete CASA integration or CE-team agreement.
- Ordinary Go Demo CE build/CI without the temporary module override awaits a
  published, resolvable CFN version containing the updated bindings. Its go.mod was
  deliberately not given an invented or unpublished version. Final dependency
  pinning and standalone verification follow separately authorized publication.
- Management audit passthrough was exercised live with old/new rows. Its generic
  JSON schema and the UI's collapsed JSON rendering were inspected; browser visual
  verification was not performed. The naming follow-up adds UI payload types;
  Management and the UI renderer need no changes.
- The existing NUL issue in legacy reason/other captured core strings remains the
  separately documented #46 follow-up. Persistence remains best effort on outages.
- TOME's current-work summary still listed #46 as open during review; its merged
  source at `712c939` was checked directly and used as the implementation base.
- Compatibility and quality checks ran locally before publication. Commits,
  pushes and PR creation are separate steps requiring explicit user authorization.

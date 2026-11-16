# CE evaluation response

Issue [#55](https://github.com/cisco-eti/ioc-scale-cfn-svc/issues/55).
The wire definition is [ce.proto](../proto/ce/v1/ce.proto).

## Common decision

`ioc.ce.v1.CognitionEngine/Evaluate` returns `outcome` (ALLOW, DENY or MODIFY)
and the existing free-text `reason`. Existing `modified_action`, `timestamp` and
`trace_id` fields retain their meanings. Requests, routing and RPC error handling
are unchanged. CFN maps ALLOW to ALLOW, DENY to BLOCK, and MODIFY to MODIFY with
the existing modify flag; unspecified and unknown outcomes retain their handling.

`details`, field 10, is an optional `google.protobuf.Struct`: an object whose
values may be nested objects, arrays, strings, numbers, booleans or null.
Each call targets one CE, so no map keyed by CE name is required. CFN does not
interpret this object to decide an action or require a particular schema.
Keep the selected CE identity or its detail schema alongside it when transporting
the object separately. The sample schemas below are examples, not shared fields.

## Existing CE compatibility

CASA and other CEs can retain their current binaries and generated bindings.
No CE upgrade, regeneration, dependency change or coordinated rollout is needed.
New consumers accept responses with no `details`; old consumers ignore field 10.

All existing names, tags, wire types and enum values remain intact. The legacy
diagnostics `denial_reason` (2), `missing_context_cause` (3), `checks_run` (5) and
`context_sufficiency` (6) are deprecated and remain usable. The three singular
enums now have optional presence; `checks_run` remains repeated and empty means
no check details. A DENY does not require a CASA denial taxonomy.

Updated bindings distinguish absent enums from explicitly supplied UNSPECIFIED.
Older bindings omit zero values, so their omission cannot reveal whether a CE
assigned zero or never set the field. CFN accepts this legacy behavior. A round
trip through an old encoder can lose explicit default presence. Regenerating
bindings is voluntary and can change source APIs (Go enum fields become pointers);
binary compatibility does not promise unchanged regenerated source APIs.

## Sample adoption

Both CF-owned samples omit the four deprecated wire diagnostics. They preserve
their decisions, reasons, metadata, findings and existing evaluation behavior.

```json
{"schema":"template-ce.v1","mode":"forced","configured_decision":"deny"}
```

Go Demo CE uses `schema: demo-ce.v1`, and puts its own `checks_run`, optional
`denial_reason`, `missing_context_cause` and `context_sufficiency` inside the object.
Checks contain `check_id`, `passed` and `reason`. Its typed internal diagnostics
remain available for policy evaluation, finding attribution and logging, then
move into `details` at the RPC boundary. The sample's existing CASA registration
identity remains necessary for the current selector; this change does not broaden
CE routing.

## Audit capture

The [disposition audit](../../../docs/specs/disposition-audit.md) preserves the selected CE identity,
decision/reason and result. New audit records use `ce_response` for captured CE
response metadata and fields. CE-owned data is stored under `ce_response.details`;
legacy diagnostics from unchanged CEs are captured directly under `ce_response`.
Optional enums explicitly set to UNSPECIFIED are recorded; absent legacy defaults
are not invented. The protobuf field remains `EvaluateResponse.details`.

Historical rows keep their original `ce_details` key and omission paths. Read APIs
pass the stored JSON through, and the UI supports both names. This is a JSON key
rename within `audit_information`, not a database column/type change; no schema
migration or historical data rewrite is needed. The Go payload uses
`DispositionInformation.CEResponse` and the custom `audit.CEResponse` type.

CFN snapshots new details before asynchronous persistence. It validates them with
protojson and rejects actual U+0000 in any decoded key or string, including nested
objects and arrays, because PostgreSQL jsonb cannot store it. Literal backslash-u0000
text remains valid. NaN and infinity also cannot be represented as Struct JSON.
On failure, omit the new object, mark `ce_response.details` in `truncated_fields`,
and log the cause; preserve the original CE response and the core audit event.

The existing 16 KiB encoded budget applies to the whole `ce_response` envelope,
including escaping and legacy fields. On overflow, drop new details as a unit
first, then apply the legacy order: timestamp, echoed trace ID, trailing checks.
Never trim an empty check list. A terminal failure omits the optional envelope
with a marker instead of panicking. Marshal errors are checked, not counted as
zero-byte successes. Historical records and read-time values are unchanged.

These safeguards prevent new details from suppressing an otherwise storable core
record. Persistence remains best effort. The existing NUL gap in legacy fields,
including the main `reason`, is a separate #46 follow-up; this change does not
rewrite those fields or alter the CE's free-text explanation contract.

## Generation and verification

CFN generation uses protoc 35.1, protoc-gen-go v1.36.12 and
protoc-gen-go-grpc v1.6.2. From the repository root, `task proto` generates both CE
and Enforcement bindings; `task proto:check` compares fresh temporary output with
the current files, including uncommitted files, checking both `.pb.go` filenames
and contents under `api/ce/v1/` and `api/enforcement/v1/`.
Generation reads the canonical Enforcement proto directly and regenerates the
NOA Python binding; no active sample proto copy remains.
CI installs the pinned compiler/plugins and runs this check before image builds or
publication. See the [setup commands](../../../cfn/README.md#grpc-enforcement-api).
`PROTOC` can select an absolute path to the pinned compiler executable.
Run Template CE's locked generator from `samples/template-ce/`:
`uv run --frozen python scripts/generate_proto.py`;
add `--check` to check freshness without rewriting files.

The frozen pre-change descriptor and binary responses in
`api/ce/v1/testdata/legacy/` must remain independent of current generation.
Tests use private descriptor pools to avoid duplicate global protobuf names.
The [wire compatibility tests](../v1/compatibility_test.go) check frozen responses
and descriptors. The [legacy CE server tests](../../../cfn/pkg/app/grpc_legacy_test.go)
exercise CFN against unchanged wire responses, and the
[PostgreSQL audit tests](../../../cfn/pkg/audit/disposition_db_test.go) cover JSONB
storage and historical records.

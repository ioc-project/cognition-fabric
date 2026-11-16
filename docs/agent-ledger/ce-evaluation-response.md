# CE response compatibility and data capture

**Scope:** Issue #55, shared `ioc.ce.v1` response and CF-owned samples.

**Guidance:** Preserve existing CE binaries and bindings: legacy fields/tags/enums
remain, explicit enum presence is never required from older CEs, and `details` is
opt-in. Regenerated source APIs can change while the wire stays compatible. Keep
legacy descriptors/fixtures frozen in private pools; a client generated from the
new proto does not establish unchanged-binding compatibility. CFN and Go Demo CE
use the shared bindings in `api/ce/v1`; keep frozen fixtures independent of
current generated code.

New audit records use `ce_response` for the captured CE response and
`ce_response.details` for arbitrary CE-provided data. Keep the protobuf field named
`details`. Historical `ce_details` JSON and omission paths remain unchanged on
reads; this rename does not require a database migration. UI types accept both
names and display the stored JSON without normalizing it.

Keep generation pins aligned in the README and CI: protoc 35.1,
protoc-gen-go v1.36.12 and protoc-gen-go-grpc v1.6.2. Compiler/plugin version
headers affect freshness even without a contract change. Compare generated
`.pb.go` filenames and contents, including expected files missing locally and
present untracked files. CI gates image builds/publication on this check.
Go and NOA Python bindings are generated directly from the canonical protos in
`api/`; compare the bindings against fresh output.
The legacy compatibility fixtures remain outside current generation.

Audit JSON validity does not establish jsonb storage validity. Reject actual NUL
in decoded detail keys and string values recursively; literal backslash-u0000 is
valid. Omit optional details on validation failure or budget overflow, with markers
and a warning. Drop the new object before legacy metadata/checks, handle marshal
errors and guard empty lists. Preserve the core audit and disposition. The older
main-reason NUL gap is a separate follow-up.

**Why:** The old loop assumed fixed legacy fields; arbitrary Struct data can
otherwise cause an empty-slice panic or lose the entire asynchronously stored row.

**Evidence:** [Contract](../../api/ce/docs/ce-evaluation-response.md),
[wire compatibility tests](../../api/ce/v1/compatibility_test.go),
[legacy CE server tests](../../cfn/pkg/app/grpc_legacy_test.go), and
[PostgreSQL audit tests](../../cfn/pkg/audit/disposition_db_test.go).

**Revisit when:** A versioned incompatible contract or audit capture policy is approved.

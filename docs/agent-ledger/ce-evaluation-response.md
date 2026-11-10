# CE response compatibility and data capture

**Scope:** Issue #55, shared `ioc.ce.v1` response and CF-owned samples.

**Guidance:** Preserve existing CE binaries and bindings: legacy fields/tags/enums
remain, explicit enum presence is never required from older CEs, and `details` is
opt-in. Regenerated source APIs can change while the wire stays compatible. Keep
legacy descriptors/fixtures frozen in private pools; a client generated from the
new proto does not establish unchanged-binding compatibility. The Go sample's
temporary sibling-module replacement must not affect the frozen image or fixtures.

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
Generation also owns the vendored local NOA Enforcement proto and Python binding;
check the copy against the canonical proto and the binding against fresh output.
The legacy compatibility fixtures remain outside current generation.

Audit JSON validity does not establish jsonb storage validity. Reject actual NUL
in decoded detail keys and string values recursively; literal backslash-u0000 is
valid. Omit optional details on validation failure or budget overflow, with markers
and a warning. Drop the new object before legacy metadata/checks, handle marshal
errors and guard empty lists. Preserve the core audit and disposition. The older
main-reason NUL gap is a separate follow-up.

**Why:** The old loop assumed fixed legacy fields; arbitrary Struct data can
otherwise cause an empty-slice panic or lose the entire asynchronously stored row.

**Evidence:** [Contract](../specs/ce-evaluation-response.md),
[approved plan](../plans/ce-neutral-evaluation-response.plan.md),
[verification](../verification/ce-neutral-evaluation-response.md), and the frozen
schema, handler and real-PostgreSQL regression tests.

**Revisit when:** A versioned incompatible contract or audit capture policy is approved.

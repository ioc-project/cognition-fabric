# Cognition Fabric API contracts

Every interface crossing the CF boundary lives here, grouped by audience.
The api/ Go module is versioned independently with api/vX.Y.Z tags; its current
version metadata is 1.0.0. The Go module path is
`github.com/ioc-project/cognition-fabric/api`. Existing protobuf packages and
wire contracts are unchanged. Local CFN and Demo CE builds use the API module in
this checkout. See [component releases](../docs/releases.md) for version metadata
and tagging.

| Contract | Implementer | Caller | Stability and audience |
| --- | --- | --- | --- |
| [CE registration and discovery REST](ce/openapi/cfn-ce.yaml) | CFN | CEs | External existing CE contract |
| [CE Evaluate/GetInfo gRPC](ce/proto/ce/v1/ce.proto) | CE | CFN | External v1 wire contract |
| [CE health callback](ce/openapi/ce-callbacks.yaml) | CE | CFN | External existing health contract |
| [Optional MAS lifecycle notification callback](ce/openapi/ce-callbacks.yaml) | CE | CFN | External existing notification contract |
| [GetDisposition/AppendAuditRecord gRPC](enforcement/proto/enforcement/v1/enforcement.proto) | CFN | Enforcement Proxy; direct-enforcement MAS runtimes | External v1 wire contract |
| [Management REST](mgmt/openapi/openapi.json) | cf-mgmt | cf-ui, CFN, CI and local tooling | Internal for now; onboarding/management may become external later |
| [MAS onboarding declaration](mgmt/docs/MAS_METADATA.md) | cf-mgmt | cf-ui, CI and local tooling | Internal for now |

Management endpoints `/api/cognition-fabric-nodes/register`,
`/api/cognition-fabric-nodes/{id}`, `/api/cognition-fabric-nodes/{id}/heartbeat`, and
`/api/cognition-engines[/{ce_id}]` are internal CFN-to-Management interfaces,
called by CFN and partly cf-ui. They remain in the Management REST specification;
they are not third-party CE or Proxy contracts.
CFN `/api/internal/*` endpoints remain documented under [cfn/](../cfn/docs/api/)
only. The shared audit tables are internal. OXP interfaces are owned by OXP.

## Generated bindings and verification

CE Go bindings are in `ce/v1`, Enforcement bindings in `enforcement/v1`.
CFN and Go Demo CE use local module replacements, with the root `go.work` for
local development. Python Template CE and NOA bindings are generated directly
from the canonical protos here; there are no active sample proto copies.

Run `make -C api proto` from the repository root to regenerate Go and Python
bindings; `make -C api proto-check` generates temporary output and compares it to
the current working tree. The Go/NOA compiler is protoc 35.1 with protoc-gen-go
v1.36.12 and protoc-gen-go-grpc 1.6.2. `PROTOC` can select the pinned compiler;
plugins must be on PATH. Template CE uses its locked grpcio-tools environment.
Run `make -C api test` and `make -C api lint` for module checks; CFN tests also
check the CE REST and callback specifications against existing handlers.
Run `make -C api openapi-check` for structural validation of both public CE
OpenAPI documents with the pinned isolated validator.

The historical CE descriptors and binaries under `ce/v1/testdata/legacy/`,
Template CE `tests/fixtures/legacy-ce.protoset`, and Demo CE
`internal/engine/testdata/legacy-ce.protoset` are frozen compatibility evidence.
Never regenerate or modify them when refreshing current bindings. Their old
source paths and module options are intentional provenance.

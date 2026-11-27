# Enforcement

The Enforcement API lets an Enforcement Proxy or a direct-enforcement MAS
runtime ask a Cognition Fabric Node (CFN) whether an interaction should proceed.
The caller applies the returned disposition.

## Ask for a disposition

1. The Proxy intercepts a configured interaction and calls CFN via gRPC
   `Enforcement/GetDisposition`.
2. CFN resolves the MAS workspace and selects one associated, enabled, online
   CASA CE with an enforcing endpoint.
3. CFN calls that CE's `Evaluate` RPC and returns the corresponding action.

The request's `payload` contains `mas_id`, `source_agent_id`,
`destination_agent_id`, `trace_id`, and `span_id`. An optional top-level
`extra` map carries string metadata. CFN forwards this map to the CE with the
resolved workspace ID. The destination value may identify an agent, model
gateway, or MCP server. CFN passes that identifier through to the CE. The
response contains `action` and `modify`.

| CE outcome | CFN response | Caller behavior |
| --- | --- | --- |
| `DECISION_ALLOW` | `ACTION_ALLOW` | Allow the interaction to proceed. |
| `DECISION_DENY` | `ACTION_BLOCK` | Block the interaction. |
| `DECISION_MODIFY` | `ACTION_MODIFY`, `modify=true` | Apply the caller's handling for a modification request. Delivering rewritten content is planned. |
| Unspecified or unknown | `ACTION_UNSPECIFIED` | Apply the caller's failure policy. |

CFN returns a gRPC error when no CE is eligible or an evaluation fails.
Message injection is planned.

## Record the result

The Proxy can submit finalized evidence through the separate
`Enforcement/AppendAuditRecord` RPC. Its `record` includes a stable producer
`audit_record_id`, MAS and interaction correlation fields, and the record's
protocol and route. For final mediation, `returned_disposition`,
`applied_outcome`, and `upstream_invocation` capture the decision and what
happened when the Proxy applied it.

CFN returns the `audit_record_id` after storing the record. An identical retry
returns the same acknowledgment without creating another row. CFN rejects
invalid records and conflicting contents under an existing producer ID.

The Management UI shows the Proxy and CE audit records for the MAS. Group them
by trace ID to see the decision and the result of mediation. The
[quickstart](getting-started/quickstart.md#read-the-audit-trail) walks through
that view with NOA.

See the [Enforcement proto](https://github.com/ioc-project/cognition-fabric/blob/main/api/enforcement/proto/enforcement/v1/enforcement.proto),
[Proxy audit ingestion contract](https://github.com/ioc-project/cognition-fabric/blob/main/api/enforcement/docs/proxy-audit-ingestion.md),
and [Enforcement Proxy project](https://github.com/ioc-project/enforcement-proxy)
for integration details.

# D5 — Enforcement Proxy Audit API

**Status:** Draft

**Date:** 2026-10-29

**Parties:** CF + Enforcement Proxy T3

## Context

The Enforcement Proxy needs to submit audit evidence to CFN so that its applied outcomes can be viewed alongside CFN disposition records.

This adds an audit RPC to the existing Enforcement service. `GetDisposition` remains unchanged.

## Proposed Contract

**Protocol:** gRPC/Proto

**Contract:** `ioc.cf.enforcement.v1.Enforcement`

**RPC:** `AppendAuditRecord`

The Proxy adopts CF-owned generated definitions and client, retaining its existing `AuditRecord` payload shape. Supported records include final mediation records, sender authorizations, and response observations.

**Behavior:**

- Each record has a stable UUID `audit_record_id` and a `recorded_at` timestamp.
- An `OK` response confirms persistence and echoes the submitted ID. The client must verify that ID.
- Retrying the same ID and contents returns the same receipt without creating another record.
- Reusing an ID with different contents returns `INVALID_ARGUMENT`.
- Captured bodies are limited to **1 MiB each**, and the complete append request to **4 MiB**.

| Failure | gRPC result |
|---|---|
| Invalid record, application size limit, or conflicting contents | `INVALID_ARGUMENT` |
| Storage unavailable | `UNAVAILABLE` |
| Unexpected failure | `INTERNAL` |
| Deadline or cancellation | `DEADLINE_EXCEEDED` / `CANCELED` |

### Request example

Local example using plaintext transport. This submits a simulated policy block; the fixed ID and timestamp allow identical retries.

```bash
grpcurl -plaintext -d '{
  "record": {
    "audit_record_id": "a9365462-5c2a-4ef5-8e08-6252cfdadfbb",
    "recorded_at": "2026-10-29T12:29:02Z",
    "trace_id": "fc95fdf231f47d23ea7dee1d9251360b",
    "span_id": "160e9f7d67d9173e",
    "mas_id": "3c0a54c0-d675-4660-919d-dddd01b8d6e3",
    "source_agent_id": "schedule_agent",
    "destination_agent_id": "read_document",
    "protocol": "http",
    "submitted_form": {
      "content_type": "application/json",
      "body": "e30=",
      "original_body_bytes": "2"
    },
    "returned_disposition": "DISPOSITION_ACTION_BLOCK",
    "applied_outcome": "APPLIED_OUTCOME_BLOCKED",
    "upstream_invocation": "UPSTREAM_INVOCATION_STATE_NOT_CALLED",
    "disposition_reason": "Manual test record: simulated policy block"
  }
}' localhost:9003 ioc.cf.enforcement.v1.Enforcement/AppendAuditRecord
```

The captured body `e30=` is base64 for `{}`.

### Response example

```json
{
  "auditRecordId": "a9365462-5c2a-4ef5-8e08-6252cfdadfbb"
}
```

## Audit Entity Changes

The existing generic audit entity gains an optional top-level **`outcome`**, shared across CFN and Proxy records.

| CFN source outcome | Proxy source outcome | Common `outcome` |
|---|---|---|
| `DECISION_ALLOW` | `APPLIED_OUTCOME_ALLOWED` | `ALLOW` |
| `DECISION_DENY` | `APPLIED_OUTCOME_BLOCKED` | `BLOCK` |
| `DECISION_MODIFY` | — | `MODIFY_REQUESTED` |
| `ERROR` | — | `ERROR` |
| — | `APPLIED_OUTCOME_DEGRADED` | `DEGRADED` |
| — | `APPLIED_OUTCOME_UNSUPPORTED` | `UNSUPPORTED` |

Unspecified or unmappable source outcomes normalize to `UNKNOWN`.

Historical CFN disposition records are **backfilled** from their recorded source outcomes. Records without an original outcome remain unset. The original evidence in `audit_information` is preserved.

The common outcome drives filtering, displayed results, and trace summaries across both producers. Operational `success` remains separate.

Proxy records use `source=PROXY`, `resource_type=ENFORCEMENT_PROXY`, and `audit_type=PROXY_MEDIATED`. MAS, trace, span, and agent IDs remain within `audit_information`.

### Stored record example

The corresponding stored audit entity is shown below. Nullable fields are explicit here; read responses may omit them.

```json
{
  "id": "1fca6829-f024-477f-9187-927ebf47b5c7",
  "source": "PROXY",
  "outcome": "BLOCK",
  "operation_id": null,
  "resource_type": "ENFORCEMENT_PROXY",
  "resource_identifier": "",
  "audit_type": "PROXY_MEDIATED",
  "audit_resource_identifier": "3c0a54c0-d675-4660-919d-dddd01b8d6e3",
  "audit_information": {
    "audit_record_id": "a9365462-5c2a-4ef5-8e08-6252cfdadfbb",
    "recorded_at": "2026-10-29T12:29:02Z",
    "trace_id": "fc95fdf231f47d23ea7dee1d9251360b",
    "span_id": "160e9f7d67d9173e",
    "mediation_item_id": "",
    "episode_urn": "",
    "mas_id": "3c0a54c0-d675-4660-919d-dddd01b8d6e3",
    "source_agent_id": "schedule_agent",
    "destination_agent_id": "read_document",
    "protocol": "http",
    "route": "",
    "item_kind": "",
    "operating_model": "",
    "submitted_form": {
      "content_type": "application/json",
      "body": "e30=",
      "truncated": false,
      "redacted": false,
      "original_body_bytes": "2",
      "fabric_origin_id": "",
      "fabric_origin_attestation": ""
    },
    "returned_disposition": "DISPOSITION_ACTION_BLOCK",
    "applied_outcome": "APPLIED_OUTCOME_BLOCKED",
    "disposition_reason": "Manual test record: simulated policy block",
    "deciding_cf_identity": "",
    "degradation_reason": "",
    "upstream_invocation": "UPSTREAM_INVOCATION_STATE_NOT_CALLED",
    "injected_forms": [],
    "extra": {},
    "boundary_evidence": {}
  },
  "audit_extra_information": null,
  "success": null,
  "created_by": "00000000-0000-0000-0000-000000000000",
  "created_on": "2026-10-29T12:29:02Z",
  "last_modified_by": "00000000-0000-0000-0000-000000000000",
  "last_modified_on": "2026-10-29T12:29:02.303359Z"
}
```

The common outcome is `BLOCK`, while the original `APPLIED_OUTCOME_BLOCKED` remains in the source details. This mediation record has no explicit response result, so `success` is unset.

## Next Steps

- CF and Enforcement Proxy teams confirm the contract, limits, and connection settings.
- The Proxy team adopts the CF definitions and qualifies delivery, receipt checking, and retries.

## Related

- [D1 — Enforcement API Contract](https://grid.outshift.io/projects/cf/tome/wiki/discussions/d1-enforcement-api-contract.md)
- [Issue #41 — Proxy audit ingestion](https://github.com/cisco-eti/ioc-scale-cfn-svc/issues/41)

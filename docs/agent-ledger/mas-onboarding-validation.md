# MAS onboarding validation

**Scope:** Management MAS mutations, their Web UI forms and CFN metadata retrieval.

**Guidance:** Management enforces semantic constraints for every caller. UI
validation provides early field feedback and does not replace backend checks;
provider CI and other tooling can call the Management API directly.

MCP server names are unique within a MAS, and native tool names are unique within
their MCP server. Compare exact strings, including the empty string. One empty
name is valid in each scope; native tool names can repeat on different servers.
Validate tools even when their server's name is empty. Duplicate requests return
HTTP 422 and leave saved state unchanged. Database uniqueness constraints remain
the final integrity boundary.

**Evidence:** The user confirmed backend enforcement during issue #43 review.
The [implementation plan](../plans/issue-43-mas-onboarding-metadata.md) includes
the narrow Management correction in stage 2. Workspace implementation and direct
API/Postgres regressions are in the
[Management service](../../../ioc-scale-cf-mgmt-svc/src/server/services/multi_agentic_system.py)
and [MCP name tests](../../../ioc-scale-cf-mgmt-svc/tests/test_mcp_name_validation.py).

**Revisit when:** The API changes accepted names, name normalization, or the
uniqueness scopes, or Management delegates semantic validation to another
authoritative backend boundary.

## Snapshot integrity and transaction scope

Stage 3 validates the final stored-and-supplied inventory, graph and bindings
under a MAS parent lock. Acquire shared CFN scope before that parent lock: CE
registration holds CFN scope exclusively before claiming CE rows and carrying
associations forward. Reversing CFN/MAS/CE lock order can deadlock an upgrade
against a metadata or membership update. Commit CE membership/overrides with
metadata and timestamps; regenerate config only after the commit.

Keep MAS GET free of row-level locks: it is also called on CFN's enforcement
path. Use a per-request read-only `REPEATABLE READ` snapshot for consistent parent
and inventory data, and return the pooled connection with normal write settings.
Automatic attachment skips/logs inactive CFNs; an explicit association request
still fails validation. Do not turn automatic attachment eligibility into a
failure of otherwise valid MAS onboarding.

Bound runtime tools resolve the native MCP definition, not another editable copy.
Legacy projection edits retain unknown definition fields and the original source
snapshot. Do not replace it when an unchanged effective definition is re-sent.
Update caller claims without dropping the server hash/state; keep document
provenance opaque instead of unwrapping it like the tool provenance envelope.
When a tool response has no `claims` key, omit write provenance entirely instead
of submitting server hashes/times/state as claims. Unchanged document snapshots
retain collection times across resends/reordering; match all caller fields,
including references, format/version, provenance and unknown extensions.
Validate known definition projection types before committing so a write cannot
produce an unreadable record.

Evidence: [metadata helpers](../../../ioc-scale-cf-mgmt-svc/src/server/services/mas_metadata.py),
[API/concurrency tests](../../../ioc-scale-cf-mgmt-svc/tests/test_mas_metadata.py),
[read/snapshot regressions](../../../ioc-scale-cf-mgmt-svc/tests/test_mas_review_regressions.py),
and [UI request regressions](../../../ioc-scale-cf-ui/tests/mas-request-draft.test.mjs).

## Existing binary CE compatibility

The default CFN MAS GET retains its historical keys, including CE keys. Expanded
metadata is explicit with `?metadata=true`. The actual Security Detections/CASA
expanded-response decoders are not available locally; their compatibility remains
unverified. Do not replace that evidence with a Demo-only compatibility claim.
Expanded reads preserve JSON numbers. Every top-level timestamp (`updated_at`
and `created_at`) is UTC RFC 3339 with `Z`, or omitted. Parse explicitly zoned
strings with `time.RFC3339Nano` and convert to UTC, preserving the instant.
Absent/null fields are omitted silently; zone-less, unparseable or non-string
values are omitted with a warning identifying `mas_id`, field and reason. Always
return HTTP 200 with the remaining metadata; never infer or configure a source
timezone. Zone-less Management values remain omitted until the separate
Management UTC-timestamp issue makes Management emit UTC `Z`; #43 does not depend
on it. Leave nested JSON and raw Management/config snapshot timestamps unchanged.

Evidence: [CFN retrieval](../../pkg/app/handlers_mas.go),
[representation tests](../../pkg/app/handlers_mas_metadata_test.go), and
[the implemented contract](../discussions/0006-mas-onboarding-metadata.md).

# Shared Proxy audit contract

**Scope:** Issue #41, CFN/Management/UI and the Proxy handoff.

**Guidance:** CF owns AppendAuditRecord under its existing Enforcement service.
Proxy consumes CF's generated definitions; no reverse dependency or Proxy-owned
AuditService is needed. Preserve source-facing record shapes without imposing
binary compatibility. Add only nullable outcome and internal nullable
source_record_id, with unique(source, source_record_id). Keep identities in JSONB;
CFN producer IDs remain null. PROXY is uppercase. ENFORCEMENT_PROXY and
PROXY_MEDIATED are new allowlist values, not pre-existing base-code values.

Canonical outcome drives shared filters and UI classification across producers;
source outcome stays unchanged in JSONB and operational success stays separate.
Filters, rows and trace summaries use the same common labels for every producer,
including Block and Modify requested for CFN. Old-response display fallbacks remain.
Acquire the same stable transaction advisory-lock key before migration schema
checks on every CFN version. It serializes migrations, not old writers; a final
restart/backfill after old writers stop is still needed during rolling upgrades.

**Why:** Avoid confusing enum constants in an unfinished draft with existing
schema, introducing identity columns, or limiting a common outcome filter to CFN.
Permanent application validation/size failures return INVALID_ARGUMENT; the
journal retries RESOURCE_EXHAUSTED, so its hard transport cap is a separate concern.

**Evidence:** [Behavioral contract](../specs/proxy-audit-ingestion.md),
[issue #41](https://github.com/cisco-eti/ioc-scale-cfn-svc/issues/41), and the approved
[plan](../plans/issue-41-proxy-audit-ingestion.md). Proxy client adoption and
production transport/receipt qualification remain external integration work.

**Revisit when:** The record schema, producer limits, transport or delivery contract changes.

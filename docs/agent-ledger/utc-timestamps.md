# UTC timestamp ownership

**Scope:** CF-owned timestamp storage, HTTP output, config changes and UI display
for issue #72.

**Guidance:** All active timestamp columns use `timestamptz`; database sessions
and CF-owned API output use UTC. Normal Management startup applies the Alembic
schema history. Developer onboarding follows the standard local tasks; keep
manual timestamp conversion and cache regeneration out of that workflow.

Keep CE-provided `EvaluateResponse.timestamp`, arbitrary details, external
documents, provenance claims and other opaque evidence under existing capture
rules. Apply UTC types to CF-owned read fields, not permissive input extras that
snapshot handling already strips/replaces. The legacy/default CFN MAS response
stays unchanged; expanded timestamps keep their explicit-zone-only adapter.

Audit JSON needs explicit UTC normalization even with a UTC DSN, because pgx can
scan `timestamptz` into the host's local location. Normalize the two owned audit
fields without recursively rewriting evidence. Compare explicit config timestamp
instants, preserving string comparison for unparseable/naive legacy input.

**Why:** Consistent UTC handling applies to CF-owned instants while preserving
CE evidence. The unreleased repository's onboarding starts with new development
data and uses the existing automatic migration path.

**Evidence:** [Timestamp contract](../specs/utc-timestamps.md),
[source startup](../../dev/cf-local.sh), and
[container startup](../../cf-mgmt/docker-entrypoint.sh).

**Revisit when:** Timestamp ownership or the service startup workflow changes.

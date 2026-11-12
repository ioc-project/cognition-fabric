# UTC timestamp ownership and local cutover

**Scope:** CF-owned timestamp storage, HTTP output, config changes and UI display
for issue #72.

**Guidance:** All active timestamp columns use `timestamptz`; new database sessions
and CF-owned API output use UTC. `LEGACY_TIMESTAMP_TZ` is read only by Management's
one-time naive-column migration, defaulting to UTC. It describes the old database
session timezone. Do not use it in CFN response adapters, change detection or new
runtime writes, and do not infer old database time from the laptop timezone.

Keep CE-provided `EvaluateResponse.timestamp`, arbitrary details, external
documents, provenance claims and other opaque evidence under existing capture
rules. Apply UTC types to CF-owned read fields, not permissive input extras that
snapshot handling already strips/replaces. The legacy/default CFN MAS response
stays unchanged; expanded timestamps keep their explicit-zone-only adapter.

The approved migration converts only 19 columns. It does not patch or regenerate
cached JSON, import an application generator, or add DST downgrade refusal.
Downgrade loses timezone information; exact restoration requires a backup.
Separately run the existing `update_config_for_all_cfns()` once, checking results
because the helper swallows exceptions. Include disabled non-deleted nodes.
Restart CFNs against updated Management to install a canonical registration
baseline without notifications. Regeneration before/after that restart is safe;
an old running naive baseline is not equivalent to a canonical one.

Audit JSON needs explicit UTC normalization even with a UTC DSN, because pgx can
scan `timestamptz` into the host's local location. Normalize the two owned audit
fields without recursively rewriting evidence. Compare explicit config timestamp
instants, preserving string comparison for unparseable/naive legacy input.

**Why:** User-approved local-development scope and CE compatibility requirements
exclude unnecessary legacy-data reconstruction and external contract changes.

**Evidence:** [Issue #72](https://github.com/cisco-eti/ioc-scale-cfn-svc/issues/72),
[approved plan](../plans/issue-72-utc-timestamps.md), and
[timestamp contract](../specs/utc-timestamps.md).

**Revisit when:** CF gains a separately approved production migration/rolling
upgrade requirement or a CE contract changes timestamp ownership.

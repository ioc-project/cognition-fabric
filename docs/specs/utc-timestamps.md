# UTC timestamps

CF-owned timestamps identify instants independently of the host, database server,
and browser timezone. PostgreSQL timestamp columns use `timestamptz`; Management
and CFN database sessions use UTC. Backend writes are timezone-aware, and HTTP
responses use RFC 3339 UTC strings ending in `Z`, for example
`2026-11-11T12:00:00.123456Z`. Fractional seconds are optional and consumers must
accept them. Null and omitted timestamp fields keep their existing semantics.

The UI parses explicitly zoned values and formats them in UTC by default. A
display timezone changes presentation only; it never changes stored values.
Malformed or timezone-less API values are not silently interpreted as browser-local
time or relabelled UTC.

## Ownership and compatibility

The rule covers CF-generated creation/update/deletion/liveness timestamps, audit
record timestamps, document collection/topology stamps and generated CFN config
timestamps. It does not rewrite timestamp-looking strings in external documents,
arbitrary configuration, provenance claims, CE details or Proxy evidence.

CE protobufs, registration/health payloads and MAS lifecycle notification shapes
are unchanged. Notifications already emit UTC `Z`. CE-supplied
`EvaluateResponse.timestamp` remains captured under its existing evidence rules,
including its original timezone/string representation.

The default CFN MAS GET retains its historical representation without timestamps.
The opt-in `?metadata=true` representation normalizes explicitly zoned top-level
`created_at`/`updated_at` to UTC. Missing/null values are omitted; invalid or naive
values are warned about and omitted while the rest of the response remains HTTP
200. CFN never guesses a legacy source timezone.

Audit output explicitly normalizes its own `created_on` and `last_modified_on`
fields, independently of the Go database driver's scan location. Other evidence
inside the record remains unchanged. Config change detection compares explicit
timestamp instants so equivalent offsets or fractional precision do not generate
`mas.updated`; genuinely different instants still do. Legacy unparseable strings
retain string comparison rather than acquiring an inferred timezone.

## Existing local-development databases

Management's `utc_timestamps_0010` migration converts only the 19 previously naive
timestamp columns. `LEGACY_TIMESTAMP_TZ` selects their old database session
timezone; unset/blank defaults to `UTC`. It is a migration-only setting, not a
runtime or frontend timezone preference. Existing aware columns are not
reinterpreted, and config caches are not changed by Alembic.

After migration, run the existing all-CFN config generator once with checked
results, including disabled non-deleted CFNs. Restart CFNs against updated
Management to install canonical config baselines without lifecycle dispatch.
Regeneration may run before or after that restart; an old running naive baseline
still requires restart. Deleted-node cache archives are not served or rewritten.

Downgrade uses the same legacy zone for the 19 columns and leaves cached `Z`
strings intact. It loses timezone information, including distinctions in repeated
DST hours; use a backup for exact restoration. No per-row DST refusal or automatic
reset/stamping is part of this local-development migration.

See the [local cutover](../../deploy/README.md#utc-timestamp-cutover) and
[Management migration guide](../../../ioc-scale-cf-mgmt-svc/docs/DATABASE_MIGRATIONS.md)
for the one-off command, result checks and environment selection.

Implementation checks and remaining manual verification are recorded in the
[issue #72 verification report](../verification/issue-72-utc-timestamps.md).

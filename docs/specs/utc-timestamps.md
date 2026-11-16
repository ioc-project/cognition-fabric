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

The default CFN MAS GET omits timestamps.
The opt-in `?metadata=true` representation normalizes explicitly zoned top-level
`created_at`/`updated_at` to UTC. Missing/null values are omitted; invalid or naive
values are warned about and omitted while the rest of the response remains HTTP
200. CFN never guesses a legacy source timezone.

Audit output explicitly normalizes its own `created_on` and `last_modified_on`
fields, independently of the Go database driver's scan location. Other evidence
inside the record remains unchanged. Config change detection compares explicit
timestamp instants so equivalent offsets or fractional precision do not generate
`mas.updated`; genuinely different instants still do. Unparseable strings
retain string comparison rather than acquiring an inferred timezone.

## Schema management

Management startup applies the Alembic schema history automatically, including
the UTC timestamp column types. See the
[database migrations guide](../../cf-mgmt/docs/DATABASE_MIGRATIONS.md)
for schema authoring and startup behavior.

Implementation checks and remaining manual verification are recorded in the
[issue #72 verification report](../verification/issue-72-utc-timestamps.md).

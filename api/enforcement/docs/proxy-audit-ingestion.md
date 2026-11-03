# Proxy audit ingestion

CFN accepts finalized Proxy evidence through
`ioc.cf.enforcement.v1.Enforcement/AppendAuditRecord`. CF owns the
[proto](../../api/proto/enforcement/v1/enforcement.proto) and generated client.
The Proxy consumes CF's definitions, following the same dependency direction as
`GetDisposition`. Its builder/codec can keep the existing field, enum and oneof
names. Binary compatibility with the Proxy-owned AuditService is not required.

This CF implementation provides the receiving, persistence and read/UI path.
The Proxy's real CFN delivery client is separate integration work; its pending
logging client is not evidence of delivery. The contract reference used here is
Proxy commit `3a36f0f51cc8c1b3008ce0de99e7de0bfa82533a`.

## Records and validation

One unary request contains `record: AuditRecord`. Accept final Envoy/legacy
mediation records, SHADi authorizations and SHADi response observations. Each has
its own canonical UUID `audit_record_id` and valid `recorded_at`. An observation
may arrive before its authorization; the link is not a database foreign key.

Validation follows the Proxy codec's variant rules, including optional presence,
enum combinations, form metadata and sender observation identities. A missing
trace/span is accepted only for its unreferenced local rejection case: no
observation, unspecified returned disposition, degraded outcome, upstream not
called and `degradation_reason=local_validation`. No synthetic trace is added.

PostgreSQL JSONB cannot represent U+0000 inside text, including metadata keys and
values. Such records receive `INVALID_ARGUMENT` before storage. This is a storage
restriction in addition to the Proxy codec's rules and belongs in the integration
handoff. Arbitrary byte captures, including zero bytes, remain valid as base64.

Captured bodies may be **at most 1 MiB each**; the complete serialized protobuf
append request, including metadata/envelope, may be **at most 4 MiB**. CFN's
receive transport limit is **8 MiB** so application size violations can reach
validation and return `INVALID_ARGUMENT`. These limits cover the inspected Proxy
defaults (4 KiB capture; 64 KiB in its minikube profile). The Proxy must cap its
configuration and complete requests accordingly before delivery is enabled;
there is no negotiation or receiver-side truncation.

Requests above the hard transport cap never reach the handler and can still get
`RESOURCE_EXHAUSTED`. The existing journal retries that code while holding its
current record. Validate producer bounds on every forwarding hop; increasing a
transport limit alone does not eliminate that failure mode.

## Storage and acknowledgements

Keep the shared `audits` table and generic entity. Add only nullable `outcome`
and nullable internal `source_record_id`, with a unique index on
`(source, source_record_id)`. CFN producer IDs remain null.

Proxy rows use:

- `source=PROXY`, `resource_type=ENFORCEMENT_PROXY`, `audit_type=PROXY_MEDIATED`.
- An empty `resource_identifier`: the record identifies no Proxy instance.
- `audit_resource_identifier=mas_id` when it fits 128 characters, otherwise empty.
- Full MAS/trace/span/source-agent/destination-agent IDs in `audit_information`,
  using the same snake_case keys as CFN. Add no identity columns.
- The complete source record in JSONB, with original protobuf enum names and
  captured-form flags/bytes. An internal `_cf_protobuf_unknown_fields` member is
  present only when needed to preserve unknown wire fields at any message level.
- `created_on=recorded_at`, `last_modified_on=initial ingestion time`, and the
  existing zero-UUID system actor for both actor ID fields.

An atomic insert commits before `OK {audit_record_id: <submitted ID>}`. Repeating
the same ID and message value returns the same receipt without changing the row.
Map order/JSON formatting do not affect equality. Different contents under the
same ID return `INVALID_ARGUMENT` without overwriting anything. A lost receipt
after commit can be retried safely. CFN never returns `ALREADY_EXISTS` for a
conflict, since the current journal treats that as success.

| Failure | gRPC code |
| --- | --- |
| Validation, application size limit, conflicting ID, known PostgreSQL text-data rejection | `INVALID_ARGUMENT` |
| Missing/disconnected/unavailable storage | `UNAVAILABLE` |
| Unexpected internal/storage failure | `INTERNAL` |
| Deadline/cancellation | `DEADLINE_EXCEEDED` / `CANCELED` |

CFN preserves the incoming deadline and uses it for the storage transaction.
The RPC handler validates the request envelope and its serialized size,
including unknown fields, before passing the record to the shared audit event
builder. The builder validates the record and maps it without applying an
RPC-envelope size limit.
PostgreSQL text-length (`22001`) and character encoding/translation
(`22021`, `22P05`) errors are permanent record rejections. Other class-22 errors,
such as server-expression failures, remain `INTERNAL` rather than causing the
Proxy to discard potentially valid evidence.
The Proxy integration must check receipt IDs and propagate errors; the existing
pending client/journal does not yet implement that receipt check or the complete
target permanent-error classifier.

## Outcomes and operational success

The shared optional outcome is a normalized event result. Preserve source values
unchanged under JSONB `outcome` (CFN) or `applied_outcome` (Proxy).

| Source | Canonical outcome |
| --- | --- |
| CFN `DECISION_ALLOW` / Proxy `APPLIED_OUTCOME_ALLOWED` | `ALLOW` |
| CFN `DECISION_DENY` / Proxy `APPLIED_OUTCOME_BLOCKED` | `BLOCK` |
| CFN `DECISION_MODIFY` | `MODIFY_REQUESTED` |
| CFN operational `ERROR` | `ERROR` |
| Proxy `APPLIED_OUTCOME_DEGRADED` | `DEGRADED` |
| Proxy `APPLIED_OUTCOME_UNSUPPORTED` | `UNSUPPORTED` |
| Unspecified/unmappable outcome | `UNKNOWN` |

Authorizations and legacy observations with unspecified application state remain
`UNKNOWN`. Historical CFN disposition outcomes are backfilled without rewriting
JSONB or identifiers/timestamps/success; absent historical outcomes stay null.
The migration is repeatable. New CFN disposition writes populate the same field.

CFN success semantics stay as defined in the [disposition spec](disposition-audit.md).
Proxy success is null for mediation/authorization records, which lack an explicit
response result. For response observations, an observed reply with no error or a
completed policy block (`error_code=blocked`) is true. Reported transport,
timeout, cancellation, remote and authorization-unavailable errors are false.
This describes the recorded transport/application step, never attests successful
remote business execution, and is independent of applied outcome.

## Reads, filters and UI

Management returns optional `outcome` alongside the existing source and JSONB.
`source_record_id` remains internal. `outcome=ALLOW|BLOCK|MODIFY_REQUESTED|ERROR|
DEGRADED|UNSUPPORTED|UNKNOWN` filters every producer before count/pagination.
Legacy `decision=allow|block|modify` maps to the corresponding common outcomes.
Conflicting decision/outcome filters return HTTP 400. Status independently filters
`success=true|false`; null outcome/status matches only the corresponding All.

The UI event selector includes `PROXY_MEDIATED`, and its Outcome selector uses the
common filter. The Actor column shows the recorded CE name/ID for CFN and
`proxy` for Proxy rows in both grouped and ungrouped views. Canonical outcome
drives both rows and trace counts, using the same labels as the filter for every producer: Allow, Block,
Modify requested, Error, Degraded, Unsupported and Unknown. Source-specific
decisions remain in JSONB. Older responses without outcome fall back to the
preserved nested source value. Missing success is not a failure.

Proxy rows match a MAS through the association or full JSONB MAS ID when the
association is absent/too long. Trace and agent fields come from the common JSONB
keys. Missing, blank or explicitly truncated traces do not merge unrelated rows.
The full record remains available through JSON expansion/copy.

## Rollout and qualification

Deploy **Management → CFN → UI → enable Proxy forwarding**. CFN must support the
new event/outcome filters before the UI sends them. Run catch-up outcome backfill
after old CFN writers stop. Disable dependent forwarding/filters before rolling
back; keep additive columns and stored evidence.

Startup migrations take a stable PostgreSQL transaction advisory lock before
schema inspection, serializing cooperating CFN nodes through DDL and backfill.
Commit or rollback releases the lock. Old versions without this lock do not
participate. After all old writers finish, restarting a new node reruns the
backfill for any remaining eligible rows with a null outcome.

After commit, CFN logs `audit backfill completed` at INFO with
`backfill=cfn_disposition_outcome` and `rows_updated`, including zero when no rows
need updating. A failure to update any row rolls back the entire migration.
Any migration or commit error logs `audit migration failed` at ERROR with the
backfill name and error, and propagates to the fatal startup error. A failed
transaction never logs backfill completion.

CFN currently serves plaintext gRPC; the local profile can explicitly use that.
Production transport must be aligned with the Proxy's TLS policy before delivery
qualification. No new application-authentication exchange is introduced here.

Run the CFN tests with an isolated `POSTGRES_TEST_DB`, Management audit tests, UI
`npm run test:audit` and type checks. The three [record fixtures](../../pkg/audit/testdata)
cover all variants. Qualify actual Proxy delivery separately, including receipt
checking, retries, permanent errors and outage recovery; the logging-only client
cannot satisfy issue #41's complete production-path acceptance.

With the sibling Management virtualenv and UI dependencies installed, set
`CF_AUDIT_WORKSPACE_VERIFY=1` and run
`go test ./pkg/app -run TestProxyRPCPostgresAndReadAPI -count=1 -v` with isolated
PostgreSQL settings. This checks RPC → PostgreSQL → CFN HTTP → Management → UI
presentation helpers with live upstream calls. It does not exercise browser
layout or substitute for actual Proxy-client qualification.

# MAS onboarding metadata

Stage 3 adds optional metadata to the existing workspace MAS create/update APIs.
The request contract and response models are generated in
[OpenAPI](../openapi/openapi.json). The cross-service contract, examples and UI/CE
behavior are documented in [CFN D6](../../../docs/discussions/0006-mas-onboarding-metadata.md).

Apply the normal Alembic upgrade to `mas_metadata_0009` before running new writers.
It adds nullable columns to MAS, agent and MCP tool records, with no data
backfill, timestamp rewrite, ID change or config regeneration. Legacy records
keep new metadata absent. Downgrading this revision removes the new metadata;
existing legacy columns are preserved. The earlier agent-identity downgrade
restrictions still apply separately.

Writes never fetch external documents or contact OXP. Inline documents preserve
content/extensions and record a server collection time/content hash. URL and
Directory references remain unresolved. Caller verification assertions remain
claims. New lists distinguish omission (retain) from `[]` (clear) and reject null;
nullable metadata scalars use null to clear.

Re-sending or reordering unchanged documents/descriptions retains their
`collected_at`. Caller content, references, format/version, provenance and
extensions identify a snapshot; meaningful changes receive a new collection time.

Semantic integrity is enforced in Management for every caller. Final-state
validation includes retained graphs/bindings when inventories are replaced.
Dangling references return structured 422 details and roll back the entire
transaction, including CE associations and timestamps. Schema validation returns
the usual list-shaped FastAPI detail.

MAS mutations acquire shared CFN scope, then the MAS parent lock, before reading
retained inventories. CE registration holds CFN scope exclusively before its
claim/carry-forward work. Multi-MAS carry-forward locks parent IDs in order.
Independent MAS writes share CFN scope and can run concurrently. Association and
override helpers use the caller's session; config generation occurs after commit.
Routine probe results do not touch MAS freshness.
Automatic CE attachment logs and skips inactive CFNs; explicitly requested
associations still validate CFN activity and roll back on failure.

MAS GET uses a per-request read-only `REPEATABLE READ` transaction. Parent data,
inventories, graphs and CE associations come from one committed snapshot without
row-locking readers against concurrent onboarding writes. Read-only/isolation
options are reset when that connection returns to the pool.

The legacy MCP catalogue remains name-based. Omitting the server list retains
it; omitted/empty tools within a supplied server remove that server's tools.
Full definitions are authoritative, and runtime bindings resolve to those native
snapshots. Editing legacy fields preserves unknown rich fields and the original
source snapshot, marking effective provenance as derived. Conflicting explicit
legacy/full/bound definitions are rejected.
On UI writes, tool provenance is reduced to caller `claims`, or omitted when no
claims exist. Server hashes, collection times and derived state are never copied
into caller claims. Document provenance remains an opaque caller object.

Tests use disposable PostgreSQL. `tests/conftest.py` recreates tables: do not run
it against a live database. Disable dotenv overrides and provide isolated test
credentials (`PYTHON_DOTENV_DISABLED=1`, `POSTGRES_*`) when testing locally.

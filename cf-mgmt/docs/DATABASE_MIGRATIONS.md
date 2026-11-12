# Database Migrations Guide

> **TL;DR** — Edit a model, run one command to generate the migration, commit it. Done.
> The migration applies automatically when the container restarts.

---

## 4 Commands You Need

```bash
task db-migrate-apply                          # Apply pending migrations to your local DB
task db-migrate-status                         # See what's applied and what's pending
task db-migrate-revision -- "your message"     # Generate a new migration from model changes
task db-migrate-downgrade                      # Undo the last migration
```

That's it. Everything else is automatic.

---

## Step-by-Step: Making a Schema Change

Here's the full workflow for adding a `foo` column to the `workspace` table.

### Step 1 — Edit the SQLAlchemy model

```python
# src/server/database/relational_db/models/workspace.py

from sqlalchemy import Column, String
# ... other imports ...

class Workspace(Base):
    __tablename__ = "workspace"

    id = Column(String(36), primary_key=True)
    name = Column(String(255), nullable=False)
    # ... other existing columns ...

    foo = Column(String(100), nullable=True)    # <-- ADD THIS LINE
```

### Step 2 — Make sure your local DB is running

```bash
task docker-compose-db-up
```

### Step 3 — Generate the migration

```bash
task db-migrate-revision -- "add foo to workspace"
```

You'll see output like:
```
Detected added column 'workspace.foo'
Generating alembic/versions/c103410d7e70_add_foo_to_workspace.py ... done
```

### Step 4 — Open the generated file and review it

The file will be at `alembic/versions/<hash>_add_foo_to_workspace.py`.

**Important:** Autogenerate sometimes detects unrelated differences between models and the database. Delete anything that isn't your change. You should end up with:

```python
"""add foo to workspace"""
from alembic import op
import sqlalchemy as sa

revision = "c103410d7e70"
down_revision = "agent_identity_0008"  # use the actual previous revision


def upgrade() -> None:
    op.add_column("workspace", sa.Column("foo", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("workspace", "foo")
```

### Step 5 — Apply it locally to test

```bash
task db-migrate-apply
```

Output:
```
Running upgrade agent_identity_0008 -> c103410d7e70, add foo to workspace
```

### Step 6 — Verify it worked

```bash
task db-migrate-status
```

### Step 7 — Commit and push

```bash
git add src/server/database/relational_db/models/workspace.py
git add alembic/versions/c103410d7e70_add_foo_to_workspace.py
git commit -m "feat: add foo column to workspace"
git push
```

### Step 8 — Deploy

When the new image deploys, the container runs `alembic upgrade head` on startup. It detects the pending migration, applies it, and the app starts. The database stays up the entire time — zero downtime.

---

## What Happens on Deploy (Automatically)

```
Container starts
    │
    ▼
docker-entrypoint.sh runs:
    │
    │  1. alembic upgrade head
    │     └─ Checks current DB revision (e.g., 0008)
    │     └─ Sees new migration (e.g., c103410d7e70)
    │     └─ Applies it in a single transaction
    │     └─ Updates alembic_version table
    │
    │  2. Seed data (if populate_software.sql exists)
    │
    │  3. uvicorn starts
    ▼
App is serving traffic
```

**If the pod crashes during step 1:** PostgreSQL rolls back the transaction. Nothing was applied. Next restart retries cleanly.

**If the DB is already up to date:** `alembic upgrade head` does nothing (prints "No pending migrations") and the app starts immediately.

---

## Rolling Back a Bad Migration

### Undo the last migration

```bash
task db-migrate-downgrade
```

This runs the `downgrade()` function from the most recent migration (e.g., drops the column you just added).

Key-changing migrations can require additional cutover steps or refuse a downgrade;
see the agent identity migration below before rolling back `agent_identity_0008`.

### Undo multiple migrations

```bash
# Go back to revision 0006
PYTHONPATH=src poetry run alembic downgrade 0006
```

---

## Agent storage identity (agent_identity_0008)

`cf_agent_id` is a CF-generated UUID primary key. `agent_id` keeps its existing
runtime value and becomes unique within `(mas_id, agent_id)`. The same runtime
ID can therefore be registered in different MAS records. Display-name uniqueness
within a MAS remains unchanged, and renaming an agent keeps its CF UUID.

The revision follows `0007` and lives in `0008_agent_storage_identity.py`. Its
identifier deliberately differs from `0008`: older Docker entrypoints used that
ambiguous marker without running this migration. Both Alembic and the local
lineage preflight must reject such a marker rather than resolve it as a prefix
of the new revision. The new entrypoint refuses automatic legacy stamping; an
unversioned legacy database needs explicit schema/history reconciliation first.

The migration adds/backfills the UUID, then replaces the key in one PostgreSQL
transaction. It preserves all legacy runtime IDs (including previously generated
UUID strings), agent content/timestamps, MAS timestamps, CE associations and saved
CFN config/version values. Backfill does not regenerate config or produce a
migration-only `mas.updated` hint. Management reads expose the new UUID; CFN's
existing MAS-details representation is unchanged in this stage.

### Cutover

1. Back up the target database and record the current agent/runtime-ID mapping.
   Inspect any custom foreign keys to `agent.agent_id`; `agent_identity_0008` rejects those
   references rather than dropping or rewriting them.
2. Stop every old Management writer using that database. The database itself
   stays running. Old writers assume globally unique runtime IDs and must not
   overlap the new writer once MAS-scoped duplicates are possible.
3. Apply `agent_identity_0008` using the normal migration entrypoint for the new Management
   build, then start that build. In the CFN local source workflow, the normal
   `task run:cfn-mgmt` start performs the existing Alembic lineage preflight and
   applies pending migrations. Confirm that it targets the intended local
   database before starting it.
4. Keep the source/image lineage preflight enabled when switching implementations.
   An old published Management image may not recognize `agent_identity_0008`; use a compatible
   build or a separate `LOCAL_CF_MGMT_DB`, as described in the
   [CF local workflow](https://github.com/cisco-eti/ioc-scale-cfn-svc/blob/main/deploy/README.md).
   Do not stamp, reset, or automatically downgrade the shared database to bypass
   a preflight rejection.

The new key is output-only in the API. Requests continue to identify agents by
the MAS URL and runtime `agent_id`; supplying a `cf_agent_id` does not select or
rename a record. Omitting `agent_id` keeps the existing generated-ID behavior.
There are no CE protobuf or NOA changes in this stage.

### Manual verification

Use the Management Swagger UI or API in the target workspace:

1. Create MAS A with an unnamed agent using
   `{"agent_id": "shared-runtime", "config": {"opaque": {"keep": true}}}`.
   Read it back and record its `cf_agent_id`.
2. Create MAS B with the same runtime ID. Its `cf_agent_id` must differ. Duplicate
   runtime IDs within a single create/update request must return 422.
3. Open MAS A in the Web UI, edit an unrelated field and save. The unnamed agent,
   runtime ID, opaque config and CF UUID must survive. Giving the agent a display
   name must preserve that same CF UUID.
4. Explicitly remove the agent row from MAS A and save. MAS B's agent must remain
   unchanged. Existing CE associations and unrelated configuration must survive
   the preceding edits.
5. Compare pre/post-backfill MAS `updated_at`, saved snapshot `last_updated_on`
   and CFN config versions before making ordinary content changes: the key
   migration alone must not advance them. Normal user edits still update
   freshness/config as before.

### Rollback boundary

Downgrade to `0007` is an explicit maintenance operation, never an automatic
fallback. Stop Management writers first. It is refused if runtime IDs repeat
across MAS records or if foreign keys reference `agent.cf_agent_id`. Reconcile
such references deliberately; the migration never renames IDs or deletes agents
to force an old global key to fit.

A successful downgrade removes the CF UUID column and its mapping. Even without
database foreign keys, callers may already have recorded these UUIDs; preserve a
backup and account for those references before choosing downgrade. Re-upgrading
after a downgrade generates new CF UUIDs. A failed upgrade/downgrade rolls back
without leaving a partially changed key.

---

## Common Recipes

### Add a nullable column

```python
def upgrade():
    op.add_column("workspace", sa.Column("icon", sa.String(255), nullable=True))

def downgrade():
    op.drop_column("workspace", "icon")
```

### Add a required column (NOT NULL with default)

```python
def upgrade():
    op.add_column("workspace", sa.Column("status", sa.String(50), nullable=False, server_default="active"))

def downgrade():
    op.drop_column("workspace", "status")
```

### Create a new table

```python
def upgrade():
    op.create_table(
        "tag",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspace.id"), nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("idx_tag_workspace_id", "tag", ["workspace_id"])

def downgrade():
    op.drop_index("idx_tag_workspace_id", table_name="tag")
    op.drop_table("tag")
```

### Add an index

```python
def upgrade():
    op.create_index("idx_audit_created_at", "audit", ["created_at"])

def downgrade():
    op.drop_index("idx_audit_created_at", table_name="audit")
```

### Rename a column

```python
def upgrade():
    op.alter_column("workspace", "config", new_column_name="settings")

def downgrade():
    op.alter_column("workspace", "settings", new_column_name="config")
```

### Run raw SQL

```python
def upgrade():
    op.execute("UPDATE workspace SET status = 'active' WHERE status IS NULL")
```

---

## Rules to Follow

1. **Always review autogenerated migrations.** Delete anything that isn't your intended change.
2. **Always write a `downgrade()`.** It should exactly reverse the `upgrade()`.
3. **Never edit a migration that's already been deployed.** Create a new migration instead.
4. **One logical change per migration.** "Add icon column" is one migration. "Add icon + rename config + create tag table" should be 2-3 separate migrations.
5. **Test locally before pushing.** Run `task db-migrate-apply` and verify with `task db-migrate-status`.

---

## Troubleshooting

| You see this | Do this |
|---|---|
| `Target database is not up to date` | `task db-migrate-apply` |
| `Multiple heads detected` | Two people created migrations from same parent. Run: `PYTHONPATH=src poetry run alembic merge heads -m "merge"` |
| `relation "X" already exists` | Your migration is missing `IF NOT EXISTS`, or DB is ahead of Alembic's tracking. Check with `task db-migrate-status` |
| Pod crashed mid-migration | Nothing to do. PostgreSQL auto-rolled-back. Next restart retries. |
| Need to check what revision the DB is on | `task db-migrate-status` (locally) or check `alembic_version` table in the DB |

---

## Environment Variables

Alembic reads the same env vars as the app (loaded from `.env` locally):

| Variable | Default | Used for |
|----------|---------|----------|
| `POSTGRES_HOST` | `localhost` | Where the DB is |
| `POSTGRES_PORT` | `5432` | DB port (use `5456` locally since docker maps to that) |
| `POSTGRES_USER` | `postgresUser` | DB credentials |
| `POSTGRES_PASSWORD` | `postgresPW` | DB credentials |
| `POSTGRES_DB` | `cfn_mgmt` | Which database to migrate |

---

## File Layout

```
project root/
├── alembic.ini                          # Points to alembic/ directory
├── alembic/
│   ├── env.py                           # Connects to DB, imports all models
│   ├── script.py.mako                   # Template for new migration files
│   └── versions/                        # All migration files live here
│       ├── 0001_consolidated_schema.py
│       ├── 0002_add_workspace_scoped_agents_and_policies.py
│       ├── ...
│       └── 0008_add_description_to_memory_provider.py
└── src/server/database/relational_db/
    └── models/                          # SQLAlchemy models (source of truth)
        ├── __init__.py                  # Base = declarative_base()
        ├── workspace.py
        ├── user.py
        └── ...
```

## UTC timestamps (`utc_timestamps_0010`)

This local-development cutover converts the 19 active timezone-less timestamp
columns in `agent`, `mcp_server`, `mcp_tool`, `multi_agentic_system`, `workspace`,
`user` and `cognition_fabric_node` to `timestamptz`. Existing CE and MAS–CE
association instants stay unchanged. New application and migration connections
use UTC; CF-owned HTTP timestamps use RFC 3339 UTC `Z`, with fractional seconds
allowed. External CE contracts and CE-supplied timestamps/evidence stay unchanged.

`LEGACY_TIMESTAMP_TZ` is read only when this revision upgrades or downgrades.
Unset or blank means `UTC`; use a PostgreSQL timezone name such as
`Europe/Budapest` when old naive values represent that **database session**
timezone. This is not necessarily the developer's OS timezone. PostgreSQL's
named-zone/DST rules apply; one setting cannot recover mixed historical zones.
Invalid names fail before DDL. Offline `alembic ... --sql` is unsupported because
the migration validates the name against the live PostgreSQL catalog; use a
disposable database to review it. The migration does not rewrite config caches,
opaque JSON, MAS content, associations or identities.

1. Record the selected legacy timezone and back up the development database.
   Stop Management writers and CFNs using it; leave PostgreSQL running. For an
   untouched existing development database, use a separate database instead.
2. Export the selected database's `POSTGRES_DB`, `POSTGRES_USER`,
   `POSTGRES_PASSWORD`, `POSTGRES_HOST` and `POSTGRES_PORT` plus the chosen
   `LEGACY_TIMESTAMP_TZ`. Apply `task db-migrate-apply` (or use the compatible
   Management image's normal migration entrypoint). In the CFN local source
   workflow, `POSTGRES_DB` must be the selected `LOCAL_CF_MGMT_DB`, not the
   published-stack database or an unrelated default. See the
   [CFN local workflow](https://github.com/cisco-eti/ioc-scale-cfn-svc/blob/main/deploy/README.md#utc-timestamp-cutover).
   Resume no old Management binary against the new schema.
3. Once, after migration, run the checked cache regeneration below with exactly
   those same database settings. Require a zero exit status and the verified
   CFN count before continuing. This includes disabled/offline non-deleted CFNs,
   which may never re-register. Deleted records' archived config JSON is excluded.
4. Restart updated CFNs to obtain a canonical registration baseline, then
   start/reload the updated UI. Check the API/storage timestamps and a genuine
   MAS change's notification. Regeneration and CFN restart may run in either
   order after migration: unchanged business data yields identical MAS stamps.
   Restarting is required for an old in-memory naive baseline; this is not a
   mixed-version rolling-upgrade guarantee.

### Checked one-off config regeneration

From this repository root in a native Poetry environment, with all five selected
`POSTGRES_*` settings already exported:

```bash
poetry run python scripts/regenerate_cfn_configs.py
```

The script intentionally does **not** load `.env` or use default database
settings. A plain Python command does not inherit the local workflow's database
selection. For an updated Management container, use its existing environment:

```bash
docker exec ioc-scale-cf-mgmt-svc python /home/app/scripts/regenerate_cfn_configs.py
```

Use the actual selected container name if different. Do not invoke a fresh image
without supplying its target database settings.

The command calls the existing `update_config_for_all_cfns()` once, then checks
results in a fresh session because that helper swallows exceptions. It verifies
that every expected non-deleted CFN's version advanced, the embedded version
matches, assigned workspace/MAS/CE coverage and associations remain complete, and
CF-owned snapshot timestamps use UTC `Z`. It prints a checked count or failing CFN
IDs and exits nonzero on failure. Do not continue cutover after a failed check.
Regeneration can advance CFN versions/`updated_at`; it does not change MAS content,
MAS freshness or associations. This is a one-off maintenance command, not a
startup hook, recurring job or API.

### Downgrade

Stop writers and CFNs, export the **same recorded** `LEGACY_TIMESTAMP_TZ`, then
explicitly run `alembic downgrade mas_metadata_0009` against the selected database.
It validates the zone and converts only those 19 columns back to naive wall time.
Existing aware CE/association columns and config caches (including `Z` strings)
are unchanged. Downgrade loses timezone/offset information, including distinctions
between instants in a repeated autumn hour; a later re-upgrade in a named zone
cannot guarantee exact restoration. Restore a backup when exact recovery matters.
Changing/removing the override after upgrade does not reinterpret stored data or
change runtime UTC behavior.

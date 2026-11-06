#!/bin/bash
set -e

echo "Starting application initialization..."
cd /home/app

# ---------------------------------------------------------------------------
# 1. Database migrations (Alembic)
# ---------------------------------------------------------------------------
echo "Running database migrations..."

DB_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"

# A bash-runner database does not establish which Alembic changes were applied.
# Never guess/stamp a revision: that can skip a required key/data migration.
OLD_TRACKER=$(psql "$DB_URL" --no-psqlrc -tA -c \
  "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_migrations');" 2>/dev/null || echo "f")
ALEMBIC_TRACKER=$(psql "$DB_URL" --no-psqlrc -tA -c \
  "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'alembic_version');" 2>/dev/null || echo "f")

if [ "$OLD_TRACKER" = "t" ] && [ "$ALEMBIC_TRACKER" = "f" ]; then
    echo "Legacy database has schema_migrations but no Alembic history." >&2
    echo "Reconcile its actual schema and migration lineage explicitly before starting Management." >&2
    echo "No revisions were stamped or migrations applied." >&2
    exit 1
fi

alembic upgrade head
echo "  Migrations complete."

# ---------------------------------------------------------------------------
# 2. Seed data
# ---------------------------------------------------------------------------
SEED_FILE="/home/app/src/server/database/relational_db/scripts/populate_software.sql"
if [ -f "$SEED_FILE" ]; then
    echo "Seeding database..."
    psql "$DB_URL" -f "$SEED_FILE"
else
    echo "Warning: populate_software.sql not found, skipping seed."
fi

# ---------------------------------------------------------------------------
# 3. Start application
# ---------------------------------------------------------------------------
echo "Starting application server..."
exec uvicorn server.main:app --host 0.0.0.0 --port 9000

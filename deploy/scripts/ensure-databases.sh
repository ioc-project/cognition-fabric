#!/bin/sh
set -eu

DB_HOST="${DB_HOST:-ioc-scale-db}"
DB_PORT="${DB_PORT:-5432}"
ENSURE_DB_NO_WAIT="${ENSURE_DB_NO_WAIT:-0}"

# Wait for Postgres to accept connections unless explicitly disabled.
if [ "$ENSURE_DB_NO_WAIT" = "1" ]; then
  PGPASSWORD="$POSTGRES_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    -c "SELECT 1" >/dev/null
else
  until PGPASSWORD="$POSTGRES_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    -c "SELECT 1" >/dev/null 2>&1; do
    echo "Waiting for Postgres at ${DB_HOST}:${DB_PORT}..."
    sleep 2
  done
fi

ensure_db() {
  db_name="$1"
  if PGPASSWORD="$POSTGRES_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    -tAc "SELECT 1 FROM pg_database WHERE datname='${db_name}'" | grep -q 1; then
    echo "Database '${db_name}' already exists"
  else
    echo "Creating database '${db_name}'"
    PGPASSWORD="$POSTGRES_PASSWORD" createdb \
      -h "$DB_HOST" \
      -p "$DB_PORT" \
      -U "$POSTGRES_USER" \
      "$db_name"
  fi
}

ensure_db cfn_mgmt
ensure_db cognition_store
ensure_db cfn_audit

echo "Database bootstrap complete"

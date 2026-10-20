#!/usr/bin/env bash
set -euo pipefail

cfn_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
deployment_dir="$cfn_dir/../ioc-scale-cf-deployment"
[[ -f "$deployment_dir/docker-compose.yml" ]] || { printf "Local CF: Missing sibling deployment checkout at %s. Clone https://github.com/cisco-eti/ioc-scale-cf-deployment beside ioc-scale-cfn-svc.\n" "$deployment_dir" >&2; exit 1; }
cd "$deployment_dir"

cf_services=(
  ioc-scale-cf-mgmt-svc
  ioc-scale-cf-mgmt-plane-ui
  ioc-scale-cfn-svc
  ioc-scale-cf-demo-ce
  ioc-scale-cf-policy-ce
)
infra_services=(
  ioc-scale-db ioc-scale-db-init
  rabbitmq redis neo4j clickhouse-server otel-collector
  oxp-clickhouse-init oxp-rabbitmq-init oxp-api
  norm embedding mce grouping analysis hierarchical-grouping
  decision-block stateful-eval
)

fail() {
  printf 'Local CF: %s\n' "$*" >&2
  exit 1
}

require_tool() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing $1. Install it before running this task."
}

require_env() {
  local name
  for name in "$@"; do
    [[ -n "${!name:-}" ]] || fail "Set $name in the CFN service .env before running this task."
  done
}

require_local_env() {
  local local_env="$cfn_dir/.env" compose_env="$deployment_dir/.env"
  [[ -f "$local_env" ]] || fail "Missing $local_env. Run cp .env.example .env in the CFN repository and configure it."
  if [[ -L "$compose_env" && ! -e "$compose_env" ]]; then
    fail "The deployment .env symlink is broken. Recreate it to point to ../ioc-scale-cfn-svc/.env."
  fi
  if [[ ! -e "$compose_env" ]]; then
    ln -s ../ioc-scale-cfn-svc/.env "$compose_env" || fail "Could not link the CFN .env into the deployment checkout for Compose."
  elif ! cmp -s "$local_env" "$compose_env"; then
    fail "The CFN and deployment .env files differ. Make the deployment .env point to ../ioc-scale-cfn-svc/.env or reconcile their contents before running local CF."
  fi
}

require_checkout() {
  local path="$1" marker="$2" url="$3"
  [[ -d "$path" && -f "$path/$marker" ]] || fail "Missing sibling checkout at $path (expected $marker). Clone $url beside ioc-scale-cfn-svc."
}

require_docker_compose() {
  require_tool docker
  docker compose version >/dev/null 2>&1 || fail "Docker Compose is unavailable. Start Docker Desktop and install Compose v2."
}

require_cf_containers_stopped() {
  local running
  if ! running="$(cd "$deployment_dir" && docker compose ps --status running --services "${cf_services[@]}")"; then
    fail "Could not inspect published CF containers. Check Docker Compose."
  fi
  if [[ -n "$running" ]]; then
    fail "Published CF containers are running: ${running//$'\n'/, }. Stop them first with: docker compose stop ${cf_services[*]}"
  fi
}

require_service() {
  local url="$1" name="$2"
  require_tool curl
  curl --fail --silent --show-error --max-time 3 "$url" >/dev/null 2>&1 || fail "$name is not ready at $url. Start it before this task."
}

set_local_postgres() {
  require_env IOC_SCALE_DB_USER IOC_SCALE_DB_PASSWORD
  export POSTGRES_HOST=localhost
  export POSTGRES_PORT="${IOC_SCALE_DB_PORT:-5456}"
  export POSTGRES_USER="$IOC_SCALE_DB_USER"
  export POSTGRES_PASSWORD="$IOC_SCALE_DB_PASSWORD"
  export POSTGRES_SSLMODE=disable
}

ensure_local_databases() {
  docker compose exec -T ioc-scale-db sh -ec '
    export PGPASSWORD="$POSTGRES_PASSWORD"
    for db_name in cfn_mgmt_local cfn_audit_local; do
      existing="$(psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT 1 FROM pg_database WHERE datname = '\''$db_name'\''")"
      if [ "$existing" = 1 ]; then
        echo "Database $db_name already exists"
      else
        createdb -U "$POSTGRES_USER" --maintenance-db="$POSTGRES_DB" "$db_name"
        echo "Created database $db_name"
      fi
    done
  '
}

require_cf_checkouts() {
  require_checkout "$deployment_dir/../ioc-scale-cf-mgmt-svc" pyproject.toml https://github.com/cisco-eti/ioc-scale-cf-mgmt-svc
  require_checkout "$cfn_dir" go.mod https://github.com/cisco-eti/ioc-scale-cfn-svc
  require_checkout "$deployment_dir/../ioc-scale-cf-ui" package.json https://github.com/cisco-eti/ioc-scale-cf-ui
  require_checkout "$deployment_dir/../ioc-scale-cf-demo-ce" demo-ce/pyproject.toml https://github.com/cisco-eti/ioc-scale-cf-demo-ce
}

prepare_management_test_db() {
  local running mapped_port
  require_local_env
  require_docker_compose
  require_tool poetry
  [[ ! -f "$deployment_dir/../ioc-scale-cf-mgmt-svc/.env" ]] || fail "The management checkout .env can override test database settings. Move it aside before running tests."

  running="$(docker compose ps --status running --services ioc-scale-db)" || fail "Could not inspect the local Postgres container."
  [[ "$running" = ioc-scale-db ]] || fail "Local Postgres is not running. Run 'task infra:up' before running CF tests."
  set_local_postgres
  mapped_port="$(docker compose port ioc-scale-db 5432)" || fail "Could not inspect the local Postgres port."
  [[ "${mapped_port##*:}" = "$POSTGRES_PORT" ]] || fail "Local Postgres is not published on port $POSTGRES_PORT. Check IOC_SCALE_DB_PORT in the CFN .env."
  export POSTGRES_DB=ioc_test

  # The management fixture recreates tables in ioc_test. Verify its target
  # before it can fall back to other local Postgres ports.
  (cd "$deployment_dir/../ioc-scale-cf-mgmt-svc" && poetry run python -c '
import os
import psycopg2
connection = psycopg2.connect(
    dbname="postgres",
    host=os.environ["POSTGRES_HOST"],
    port=int(os.environ["POSTGRES_PORT"]),
    user=os.environ["POSTGRES_USER"],
    password=os.environ["POSTGRES_PASSWORD"],
)
connection.close()
' >/dev/null 2>&1) || fail "Cannot connect to the local Compose Postgres on port $POSTGRES_PORT. Check the database credentials and run 'task infra:up'."
}

run_cf_tests() {
  require_cf_checkouts
  require_tool go
  require_tool make
  require_tool uv
  prepare_management_test_db

  printf 'CF tests: management service (dedicated ioc_test database)\n'
  (cd "$deployment_dir/../ioc-scale-cf-mgmt-svc" && poetry run pytest tests/)
  printf 'CF tests: CFN service\n'
  (cd "$cfn_dir" && make test)
  printf 'CF tests: demo CE\n'
  (cd "$deployment_dir/../ioc-scale-cf-demo-ce/demo-ce" && uv run --frozen --extra test pytest)
  printf 'CF tests: UI and deployment have no unit-test suite.\n'
}

run_cf_checks() {
  require_cf_checkouts
  require_local_env
  require_docker_compose
  require_tool task
  require_tool make
  require_tool npm
  [[ -x "$deployment_dir/../ioc-scale-cf-ui/node_modules/.bin/tsc" ]] || fail "UI dependencies are missing. Run 'npm ci' in the sibling ioc-scale-cf-ui checkout."

  printf 'CF checks: deployment Compose configuration\n'
  docker compose config --quiet
  printf 'CF checks: management formatting and lint\n'
  (cd "$deployment_dir/../ioc-scale-cf-mgmt-svc" && task lint-check)
  printf 'CF checks: CFN formatting and vet\n'
  (cd "$cfn_dir" && make lint)
  printf 'CF checks: UI lint, Prettier, and types\n'
  (cd "$deployment_dir/../ioc-scale-cf-ui" && npm run lint:check && ./node_modules/.bin/tsc --noEmit)
  run_cf_tests
}

case "${1:-}" in
  test)
    run_cf_tests
    ;;
  check)
    run_cf_checks
    ;;
  infra-up)
    require_local_env
    require_docker_compose
    docker compose up -d "${infra_services[@]}"
    ensure_local_databases
    ;;
  infra-down)
    require_local_env
    require_docker_compose
    require_cf_containers_stopped
    docker compose stop "${infra_services[@]}"
    ;;
  run-cfn-mgmt)
    require_local_env
    repo="$deployment_dir/../ioc-scale-cf-mgmt-svc"
    require_checkout "$repo" pyproject.toml https://github.com/cisco-eti/ioc-scale-cf-mgmt-svc
    require_docker_compose
    require_cf_containers_stopped
    [[ ! -f "$repo/.env" ]] || fail "$repo/.env overrides the database settings in management code. Remove or rename it before running local CF."
    require_tool poetry
    require_env ADMIN_USER_PASSWORD
    set_local_postgres
    export POSTGRES_DB=cfn_mgmt_local
    unset ALEMBIC_DB_URL
    export CFN_SVC_URL=http://localhost:9002
    # The management app logs an admin API key when this is enabled.
    export CFN_DEV_MODE=False
    export CE_MONITOR_CHECK_INTERVAL_SECONDS="${CE_MONITOR_CHECK_INTERVAL_SECONDS:-1}"
    export CE_OFFLINE_THRESHOLD_SECONDS="${CE_OFFLINE_THRESHOLD_SECONDS:-3}"
    export PYTHONPATH="$repo/src"
    cd "$repo"
    poetry run python -c 'import alembic, fastapi, uvicorn' >/dev/null 2>&1 || fail "Management dependencies are missing. Run 'poetry install' in $repo."
    [[ "$POSTGRES_HOST:$POSTGRES_PORT/$POSTGRES_DB" = "localhost:${IOC_SCALE_DB_PORT:-5456}/cfn_mgmt_local" && -z "${ALEMBIC_DB_URL:-}" ]] || fail "Management migration target is not the local CF database."
    poetry run alembic upgrade head
    require_cf_containers_stopped
    exec poetry run uvicorn server.main:app --app-dir src --host 127.0.0.1 --port 9000 --reload
    ;;
  run-cfn)
    require_local_env
    repo="$cfn_dir"
    require_checkout "$repo" go.mod https://github.com/cisco-eti/ioc-scale-cfn-svc
    require_docker_compose
    require_cf_containers_stopped
    require_service http://localhost:9000/health 'Local CF management'
    require_tool go
    set_local_postgres
    export POSTGRES_AUDIT_DB=cfn_audit_local
    export MGMT_URL=http://localhost:9000
    export CFN_NAME="${CFN_NAME:-cfn-local}"
    export CFN_IP=127.0.0.1
    export APP_PORT=9002 GRPC_PORT=9003
    [[ "$POSTGRES_HOST:$POSTGRES_PORT/$POSTGRES_AUDIT_DB" = "localhost:${IOC_SCALE_DB_PORT:-5456}/cfn_audit_local" ]] || fail "CFN audit target is not the local CF database."
    cd "$repo"
    export CGO_ENABLED=0
    export GOPROXY=off
    require_cf_containers_stopped
    exec go run ./cmd/cfn
    ;;
  run-cf-ui)
    require_local_env
    repo="$deployment_dir/../ioc-scale-cf-ui"
    require_checkout "$repo" package.json https://github.com/cisco-eti/ioc-scale-cf-ui
    require_docker_compose
    require_cf_containers_stopped
    require_service http://localhost:9000/health 'Local CF management'
    require_tool node
    require_tool npm
    require_env NEXTAUTH_SECRET
    [[ -x "$repo/node_modules/.bin/next" ]] || fail "UI dependencies are missing. Run 'npm ci' in $repo."
    export CFN_UI_API_BASE_URL=http://localhost:9000
    export NEXT_PUBLIC_CFN_UI_API_BASE_URL=http://localhost:9000
    export NEXTAUTH_URL=http://localhost:9001
    export NODE_ENV=development
    cd "$repo"
    require_cf_containers_stopped
    exec npm run dev
    ;;
  run-full-mas)
    mode="${NOA_MODE:-published}"
    [[ "$mode" = published || "$mode" = source ]] || fail "Invalid NOA_MODE '$mode'. Use published (default) or source."
    require_local_env
    require_docker_compose
    require_cf_containers_stopped
    if [[ "$mode" = published ]]; then
      docker compose --profile full-mas up --no-build --no-deps noa-trip-planner
    else
      repo="$cfn_dir/deploy/local/noa-trip-planner"
      [[ -f "$repo/pyproject.toml" && -f "$repo/src/noa_trip_planner/enforcement.py" ]] || fail "Missing CF-owned NOA source at $repo. Check the CFN service checkout."
      running="$(docker compose --profile full-mas ps --status running --services noa-trip-planner)" || fail "Could not inspect the NOA container. Check Docker Compose."
      [[ -z "$running" ]] || fail "The published NOA container is running. Stop it with: docker compose --profile full-mas stop noa-trip-planner"
      running="$(docker compose ps --status running --services otel-collector)" || fail "Could not inspect the OTel collector. Check Docker Compose."
      [[ "$running" = otel-collector ]] || fail "OTel collector is not running. Run 'task infra:up' first."
      require_tool uv
      require_env AI_GATEWAY_BASE_URL AI_GATEWAY_API_KEY
      require_env NOA_MAS_ID
      require_service http://localhost:9002/api/internal/diagnostics/health 'Local CFN'
      [[ -d "$repo/.venv" ]] || fail "NOA dependencies are missing. Run 'uv sync --frozen' in $repo."
      export NOA_API_HOST=127.0.0.1
      export NOA_API_PORT="${NOA_API_PORT:-8125}"
      export NOA_CFN_GRPC_TARGET=127.0.0.1:9003
      export OTLP_HTTP_ENDPOINT=http://localhost:4318
      cd "$repo"
      exec uv run --no-sync main
    fi
    ;;
  run-demo-ce)
    require_local_env
    repo="$deployment_dir/../ioc-scale-cf-demo-ce/demo-ce"
    require_checkout "$deployment_dir/../ioc-scale-cf-demo-ce" demo-ce/pyproject.toml https://github.com/cisco-eti/ioc-scale-cf-demo-ce
    require_docker_compose
    require_cf_containers_stopped
    require_service http://localhost:9002/api/internal/diagnostics/health 'Local CFN'
    require_service http://localhost:8081/healthz 'OXP API'
    require_tool uv
    [[ -d "$repo/.venv" ]] || fail "Demo CE dependencies are missing. Run 'uv sync --frozen' in $repo."
    export CFN_URL=http://localhost:9002
    export COGNITION_ENGINE_HOST=localhost
    export GRPC_PORT=50051
    export CE_NAME=demo-ce CE_VERSION=1.0.0 CE_TYPE=CASA
    export CE_HEARTBEAT_INTERVAL_SEC="${CE_HEARTBEAT_INTERVAL_SEC:-1}"
    export COGNITION_STORE_URL=http://localhost:8081
    export DEMO_CE_DECISION="${DEMO_CE_DECISION:-allow}"
    cd "$repo"
    require_cf_containers_stopped
    exec uv run --no-sync python -m src
    ;;
  run-policy-ce)
    require_local_env
    repo="$deployment_dir/../ioc-scale-cf-demo-ce/policy-ce"
    require_checkout "$deployment_dir/../ioc-scale-cf-demo-ce" policy-ce/go.mod https://github.com/cisco-eti/ioc-scale-cf-demo-ce
    require_env CE_POLICY_FILE
    # Task is invoked from CFN; resolve relative policy paths before changing directory.
    [[ "$CE_POLICY_FILE" = /* ]] || CE_POLICY_FILE="$cfn_dir/$CE_POLICY_FILE"
    [[ -f "$CE_POLICY_FILE" ]] || fail "Policy file not found at $CE_POLICY_FILE. See deploy/README.md for policy CE setup."
    export CE_POLICY_FILE
    if [[ -n "${CE_MAS_FILE:-}" ]]; then
      [[ "$CE_MAS_FILE" = /* ]] || CE_MAS_FILE="$cfn_dir/$CE_MAS_FILE"
      export CE_MAS_FILE
    fi
    require_docker_compose
    require_cf_containers_stopped
    require_service http://localhost:9002/api/internal/diagnostics/health 'Local CFN'
    require_service http://localhost:8081/healthz 'OXP API'
    require_tool go
    export CFN_URL=http://localhost:9002
    export OXP_API_URL=http://localhost:8081
    export GRPC_LISTEN_ADDRESS=127.0.0.1:18001
    export HTTP_LISTEN_ADDRESS=127.0.0.1:18000
    export ADVERTISED_GRPC_ADDRESS=127.0.0.1:18001
    export ADVERTISED_HEALTH_URL=http://127.0.0.1:18000/healthz
    export CE_NAME="${POLICY_CE_NAME:-policy-ce}" CE_VERSION=reference-v1 CE_TYPE=CASA
    export CGO_ENABLED=0 GOWORK=off
    # Use sibling CFN contracts without changing either checkout's module files.
    build_dir="$(mktemp -d "${TMPDIR:-/tmp}/cf-policy-ce.XXXXXX")"
    trap 'rm -rf "$build_dir"' EXIT
    cp "$repo/go.mod" "$build_dir/policy-ce.mod"
    cp "$repo/go.sum" "$build_dir/policy-ce.sum"
    cd "$repo"
    go mod edit -modfile="$build_dir/policy-ce.mod" "-replace=github.com/cisco-eti/ioc-scale-cfn-svc=$cfn_dir"
    printf 'Building policy CE from %s (policy: %s)\n' "$repo" "$CE_POLICY_FILE"
    go build -mod=mod -modfile="$build_dir/policy-ce.mod" -o "$build_dir/policy-ce" ./cmd/policy-ce
    require_cf_containers_stopped
    "$build_dir/policy-ce"
    ;;
  *)
    fail "Unknown action '${1:-}'. Use task test, check, infra:up, infra:down, run:cfn-mgmt, run:cfn, run:cf-ui, run:demo-ce, run:policy-ce, or run:full-mas."
    ;;
esac

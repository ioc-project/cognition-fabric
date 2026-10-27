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
  [[ -f "$cfn_dir/.env" ]] || fail "Missing $cfn_dir/.env. Run cp .env.example .env in the CFN repository and configure it."
}

compose() {
  docker compose --project-directory "$deployment_dir" \
    -p "${COMPOSE_PROJECT_NAME:-ioc-scale-cf-deployment}" \
    --env-file "$cfn_dir/.env" -f "$deployment_dir/docker-compose.yml" "$@"
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
  if ! running="$(cd "$deployment_dir" && compose ps --status running --services "${cf_services[@]}")"; then
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
  compose exec -T ioc-scale-db sh -ec '
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
  require_checkout "$deployment_dir/../ioc-scale-cf-demo-ce" template-ce/pyproject.toml https://github.com/cisco-eti/ioc-scale-cf-demo-ce
  require_checkout "$deployment_dir/../ioc-scale-cf-demo-ce" demo-ce/go.mod https://github.com/cisco-eti/ioc-scale-cf-demo-ce
}

prepare_management_test_db() {
  local running mapped_port
  require_local_env
  require_docker_compose
  require_tool poetry
  [[ ! -f "$deployment_dir/../ioc-scale-cf-mgmt-svc/.env" ]] || fail "The management checkout .env can override test database settings. Move it aside before running tests."

  running="$(compose ps --status running --services ioc-scale-db)" || fail "Could not inspect the local Postgres container."
  [[ "$running" = ioc-scale-db ]] || fail "Local Postgres is not running. Run 'task infra:up' before running CF tests."
  set_local_postgres
  mapped_port="$(compose port ioc-scale-db 5432)" || fail "Could not inspect the local Postgres port."
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
  printf 'CF tests: template CE\n'
  (cd "$deployment_dir/../ioc-scale-cf-demo-ce/template-ce" && uv run --frozen --extra test pytest)
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
  compose config --quiet
  printf 'CF checks: management formatting and lint\n'
  (cd "$deployment_dir/../ioc-scale-cf-mgmt-svc" && task lint-check)
  printf 'CF checks: CFN formatting and vet\n'
  (cd "$cfn_dir" && make lint)
  printf 'CF checks: UI lint, Prettier, and types\n'
  (cd "$deployment_dir/../ioc-scale-cf-ui" && npm run lint:check && ./node_modules/.bin/tsc --noEmit)
  run_cf_tests
}

# NOA source/image selection and enforcement mode are independent settings.
validate_noa_modes() {
  export NOA_MODE="${NOA_MODE:-source}"
  export NOA_ENFORCEMENT_MODE="${NOA_ENFORCEMENT_MODE:-direct}"
  [[ "$NOA_MODE" = published || "$NOA_MODE" = source ]] || fail "Invalid NOA_MODE '$NOA_MODE'. Use published or source."
  [[ "$NOA_ENFORCEMENT_MODE" = direct || "$NOA_ENFORCEMENT_MODE" = proxy ]] || fail "Invalid NOA_ENFORCEMENT_MODE '$NOA_ENFORCEMENT_MODE'. Use direct or proxy."
  [[ "$NOA_MODE:$NOA_ENFORCEMENT_MODE" != published:proxy ]] || fail "Proxy enforcement requires NOA_MODE=source in the CFN .env."
}

proxy_settings() {
  export CFN_PROXY_CONFIG_DIR="$cfn_dir/tmp/enforcement"
  export NOA_TOOLS_PORT="${NOA_TOOLS_PORT:-8126}"
  export NOA_TOOLS_HOST="${NOA_TOOLS_HOST:-0.0.0.0}"
  export NOA_ENFORCEMENT_PROXY_URL="${NOA_ENFORCEMENT_PROXY_URL:-http://127.0.0.1:${ENVOY_HTTP_PORT:-9010}}"
  export NOA_TOOL_TOKEN_FILE="$CFN_PROXY_CONFIG_DIR/tool-token"
}

proxy_compose() {
  compose -f "$deployment_dir/enforcement/envoy/compose.yaml" \
    -f "$cfn_dir/deploy/local/enforcement/compose.override.yaml" "$@"
}

require_proxy_ownership() {
  local mounted
  if mounted="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/etc/envoy/envoy.yaml"}}{{.Source}}{{end}}{{end}}' ioc-scale-enforcement-proxy-envoy 2>/dev/null)"; then
    [[ "$mounted" = "$CFN_PROXY_CONFIG_DIR/envoy.json" ]] || fail "An Envoy container from another workflow exists. Stop/remove it before starting the CFN source proxy."
  fi
}

render_proxy_config() {
  require_tool python3
  PYTHONPATH="$cfn_dir/deploy/local/noa-trip-planner/src" python3 -m noa_trip_planner.proxy_config \
    --directory "$CFN_PROXY_CONFIG_DIR" --mas-id "${NOA_MAS_ID:-}" --tools-port "$NOA_TOOLS_PORT"
}

wait_for_local_proxy() {
  local attempt
  require_tool curl
  for ((attempt=0; attempt<30; attempt++)); do
    if curl --noproxy '*' --fail --silent --max-time 1 "http://127.0.0.1:${ENVOY_HTTP_PORT:-9010}/healthz" >/dev/null; then
      return
    fi
    sleep 1
  done
  fail "Local Envoy did not become ready. Inspect it with 'task proxy:logs'."
}

start_local_proxy() {
  local other
  proxy_settings
  require_cf_containers_stopped
  require_proxy_ownership
  other="$(docker ps -a --filter 'name=^/ioc-scale-enforcement-proxy-shadi-verifier$' --format '{{.Names}}')"
  [[ -z "$other" ]] || fail "A SHADi enforcement container exists. Stop/remove it before using the local Envoy workflow."
  render_proxy_config
  # The source CFN and NOA are started later. No published CF dependencies or
  # example echo upstream are started by these explicit --no-deps calls.
  proxy_compose stop ioc-scale-enforcement-proxy-envoy
  proxy_compose up -d --no-deps ioc-scale-enforcement-proxy-mediation
  proxy_compose up --no-deps --abort-on-container-exit --exit-code-from ioc-scale-enforcement-proxy-sidecar-installer ioc-scale-enforcement-proxy-sidecar-installer
  proxy_compose up --no-deps --abort-on-container-exit --exit-code-from ioc-scale-enforcement-proxy-wasm-installer ioc-scale-enforcement-proxy-wasm-installer
  proxy_compose up -d --no-deps --force-recreate ioc-scale-enforcement-proxy-envoy
  wait_for_local_proxy
  printf 'Local proxy ready on port %s; source CFN and NOA may be started next.\n' "${ENVOY_HTTP_PORT:-9010}"
}

stop_local_proxy() {
  proxy_settings
  if [[ -f "$CFN_PROXY_CONFIG_DIR/state.json" ]]; then
    require_proxy_ownership
    proxy_compose stop ioc-scale-enforcement-proxy-envoy \
      ioc-scale-enforcement-proxy-sidecar-installer ioc-scale-enforcement-proxy-wasm-installer \
      ioc-scale-enforcement-proxy-mediation
  fi
}

prepare_noa_proxy() {
  local running
  proxy_settings
  require_proxy_ownership
  running="$(proxy_compose ps --status running --services ioc-scale-enforcement-proxy-envoy)"
  [[ "$running" = ioc-scale-enforcement-proxy-envoy ]] || fail "Proxy mode is selected but Envoy is not running. Run 'task infra:up' with the same CFN .env first."
  # The MAS may have been created after infra:up. Recreate Envoy to load the
  # exact generated routes and new file mounts; no infrastructure is started.
  render_proxy_config
  proxy_compose up -d --no-deps --force-recreate ioc-scale-enforcement-proxy-envoy
  wait_for_local_proxy
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
    validate_noa_modes
    require_docker_compose
    compose up -d "${infra_services[@]}"
    ensure_local_databases
    if [[ "$NOA_ENFORCEMENT_MODE" = proxy ]]; then
      start_local_proxy
    fi
    ;;
  infra-down)
    require_local_env
    require_docker_compose
    require_cf_containers_stopped
    stop_local_proxy
    compose stop "${infra_services[@]}"
    ;;
  proxy-logs)
    require_local_env
    require_docker_compose
    proxy_settings
    proxy_compose logs -f --tail=100 ioc-scale-enforcement-proxy-envoy ioc-scale-enforcement-proxy-mediation
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
    require_local_env
    validate_noa_modes
    mode="$NOA_MODE"
    require_docker_compose
    require_cf_containers_stopped
    if [[ "$mode" = published ]]; then
      compose --profile full-mas up --no-build --no-deps noa-trip-planner
    else
      repo="$cfn_dir/deploy/local/noa-trip-planner"
      [[ -f "$repo/pyproject.toml" && -f "$repo/src/noa_trip_planner/enforcement.py" ]] || fail "Missing CF-owned NOA source at $repo. Check the CFN service checkout."
      running="$(compose --profile full-mas ps --status running --services noa-trip-planner)" || fail "Could not inspect the NOA container. Check Docker Compose."
      [[ -z "$running" ]] || fail "The published NOA container is running. Stop it with: docker compose --profile full-mas stop noa-trip-planner"
      running="$(compose ps --status running --services otel-collector)" || fail "Could not inspect the OTel collector. Check Docker Compose."
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
      if [[ "$NOA_ENFORCEMENT_MODE" = proxy ]]; then
        prepare_noa_proxy
        cd "$repo"
        exec uv run --no-sync python -m noa_trip_planner.proxy_runtime
      fi
      cd "$repo"
      exec uv run --no-sync main
    fi
    ;;
  run-template-ce)
    require_local_env
    repo="$deployment_dir/../ioc-scale-cf-demo-ce/template-ce"
    require_checkout "$deployment_dir/../ioc-scale-cf-demo-ce" template-ce/pyproject.toml https://github.com/cisco-eti/ioc-scale-cf-demo-ce
    require_docker_compose
    require_cf_containers_stopped
    require_service http://localhost:9002/api/internal/diagnostics/health 'Local CFN'
    require_service http://localhost:8081/healthz 'OXP API'
    require_tool uv
    export CFN_URL=http://localhost:9002
    export COGNITION_ENGINE_HOST=localhost
    export GRPC_PORT=50051
    # The template CE starts separate health and notification servers; both default to 8080.
    export HEALTH_PORT=8082 HTTP_PORT=8080
    # Registration defaults belong to the CE; forward only an explicit name override.
    [[ -z "${TEMPLATE_CE_NAME:-}" ]] || export CE_NAME="$TEMPLATE_CE_NAME"
    export COGNITION_STORE_URL=http://localhost:8081
    cd "$repo"
    require_cf_containers_stopped
    # Sync locked runtime dependencies after sibling updates, preserving installed extras.
    exec uv run --frozen python -m src
    ;;
  run-demo-ce)
    require_local_env
    repo="$deployment_dir/../ioc-scale-cf-demo-ce/demo-ce"
    require_checkout "$deployment_dir/../ioc-scale-cf-demo-ce" demo-ce/go.mod https://github.com/cisco-eti/ioc-scale-cf-demo-ce
    require_env CE_CONFIG_FILE
    # Task is invoked from CFN; resolve relative config paths before changing directory.
    [[ "$CE_CONFIG_FILE" = /* ]] || CE_CONFIG_FILE="$cfn_dir/$CE_CONFIG_FILE"
    [[ -f "$CE_CONFIG_FILE" ]] || fail "Config file not found at $CE_CONFIG_FILE. See deploy/README.md for demo CE setup."
    export CE_CONFIG_FILE
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
    # The CE registers the base URL and a separate /healthz endpoint.
    export ADVERTISED_HEALTH_URL=http://127.0.0.1:18000
    # Registration defaults belong to the CE; forward only an explicit name override.
    [[ -z "${DEMO_CE_NAME:-}" ]] || export CE_NAME="$DEMO_CE_NAME"
    export CGO_ENABLED=0 GOWORK=off
    # Use sibling CFN contracts without changing either checkout's module files.
    build_dir="$(mktemp -d "${TMPDIR:-/tmp}/cf-demo-ce.XXXXXX")"
    trap 'rm -rf "$build_dir"' EXIT
    cp "$repo/go.mod" "$build_dir/demo-ce.mod"
    cp "$repo/go.sum" "$build_dir/demo-ce.sum"
    cd "$repo"
    go mod edit -modfile="$build_dir/demo-ce.mod" "-replace=github.com/cisco-eti/ioc-scale-cfn-svc=$cfn_dir"
    printf 'Building demo CE from %s (config: %s)\n' "$repo" "$CE_CONFIG_FILE"
    go build -mod=mod -modfile="$build_dir/demo-ce.mod" -o "$build_dir/demo-ce" ./cmd/demo-ce
    require_cf_containers_stopped
    "$build_dir/demo-ce"
    ;;
  *)
    fail "Unknown action '${1:-}'. Use task test, check, infra:up, infra:down, run:cfn-mgmt, run:cfn, run:cf-ui, run:template-ce, run:demo-ce, run:full-mas, or proxy:logs."
    ;;
esac

#!/usr/bin/env bash
# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cfn_dir="$root_dir/cfn"
api_dir="$root_dir/api"
mgmt_dir="$root_dir/cf-mgmt"
ui_dir="$root_dir/cf-ui"
samples_dir="$root_dir/samples"
dev_dir="$root_dir/dev"
local_dir="$root_dir/.local"
deployment_dir="$root_dir/deploy"
export GOWORK="$root_dir/go.work"
[[ -f "$deployment_dir/docker-compose.yml" ]] || { printf 'Local CF: Missing %s/docker-compose.yml. Restore deploy/ from the cognition-fabric checkout.\n' "$deployment_dir" >&2; exit 1; }
cd "$deployment_dir"

cf_services=(
  ioc-scale-cf-mgmt-svc
  ioc-scale-cf-mgmt-plane-ui
  ioc-scale-cfn-svc
  ioc-scale-cf-demo-ce
  ioc-scale-cf-template-ce
)
infra_services=(
  ioc-scale-db ioc-scale-db-init
  rabbitmq neo4j clickhouse-server otel-collector
  scope-clickhouse-init scope-rabbitmq-init ioc-analytics-api
  norm event-exporter
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
    [[ -n "${!name:-}" ]] || fail "Set $name in the root .env before running this task."
  done
}

require_local_env() {
  [[ -f "$root_dir/.env" ]] || fail "Missing $root_dir/.env. Run cp .env.example .env in the monorepo root and configure it."
}

compose() {
  export CF_LOCAL_ENV_FILE="$root_dir/.env"
  docker compose --project-directory "$deployment_dir" \
    -p "${COMPOSE_PROJECT_NAME:-ioc-scale-cf-deployment}" \
    --env-file "$root_dir/.env" -f "$deployment_dir/docker-compose.yml" \
    -f "$dev_dir/compose/infrastructure.override.yaml" "$@"
}

image_compose() {
  # Set paths even for non-CE commands: Compose interpolates every service.
  export CF_LOCAL_CE_CONFIG_FILE="${CF_LOCAL_CE_CONFIG_FILE:-$local_dir/ce/config.json}"
  export CF_LOCAL_CE_MAS_FILE="${CF_LOCAL_CE_MAS_FILE:-$local_dir/ce/mas-id}"
  COMPOSE_IGNORE_ORPHANS=true docker compose --project-directory "$root_dir" \
    -p "${COMPOSE_PROJECT_NAME:-ioc-scale-cf-deployment}" \
    --env-file "$root_dir/.env" -f "$dev_dir/compose/images.yaml" "$@"
}

require_checkout() {
  local path="$1" marker="$2"
  [[ -d "$path" && -f "$path/$marker" ]] || fail "Missing component at $path (expected $marker). Restore it from the cognition-fabric checkout."
}

require_docker_compose() {
  require_tool docker
  docker compose version >/dev/null 2>&1 || fail "Docker Compose is unavailable. Start Docker Desktop and install Compose v2."
}

running_cf_services() {
  image_compose ps --status running --services "${cf_services[@]}"
}

require_local_cf_containers() {
  local running service owner
  if ! running="$(running_cf_services)"; then
    fail "Could not inspect published CF containers. Check Docker Compose."
  fi
  while IFS= read -r service; do
    [[ -n "$service" ]] || continue
    owner="$(docker inspect --format '{{index .Config.Labels "io.cisco.cf.local"}}' "$service")" || fail "Could not inspect $service."
    [[ "$owner" = true ]] || fail "$service belongs to the published deployment, not the local databases. Stop that stack before using local tasks."
  done <<< "$running"
}

require_service_container_stopped() {
  local running
  require_local_cf_containers
  running="$(image_compose ps --status running --services "$@")" || fail "Could not inspect $*."
  [[ -z "$running" ]] || fail "${running%%$'\n'*} is already running. Stop its image task with Ctrl+C before starting another instance."
}

require_ports_free() {
  require_tool python3
  python3 "$dev_dir/tools/check_ports.py" "$@"
}

require_local_postgres() {
  local running
  running="$(compose ps --status running --services ioc-scale-db)" || fail "Could not inspect local Postgres."
  [[ "$running" = ioc-scale-db ]] || fail "Local Postgres is not running. Run 'task infra:up' first."
}

cfn_runs_in_container() {
  local running
  running="$(image_compose ps --status running --services ioc-scale-cfn-svc)" || fail "Could not inspect CFN."
  [[ "$running" = ioc-scale-cfn-svc ]]
}

source_ce_host() {
  if cfn_runs_in_container; then
    printf 'host.docker.internal'
  else
    printf '127.0.0.1'
  fi
}

prepare_demo_config() {
  require_env CE_CONFIG_FILE
  [[ "$CE_CONFIG_FILE" = /* ]] || CE_CONFIG_FILE="$root_dir/$CE_CONFIG_FILE"
  [[ -f "$CE_CONFIG_FILE" ]] || fail "Config file not found at $CE_CONFIG_FILE. See dev/README.md for demo CE setup."
  export CE_CONFIG_FILE
  if [[ -n "${CE_MAS_FILE:-}" ]]; then
    [[ "$CE_MAS_FILE" = /* ]] || CE_MAS_FILE="$root_dir/$CE_MAS_FILE"
    export CE_MAS_FILE
  fi
}

run_cf_image() {
  local service="$1"
  shift
  require_local_env
  require_docker_compose
  require_service_container_stopped "$service"
  require_ports_free "$@"
  require_env IOC_SCALE_DB_USER IOC_SCALE_DB_PASSWORD ADMIN_USER_PASSWORD
  require_local_postgres
  case "$service" in
    ioc-scale-cfn-svc|ioc-scale-cf-mgmt-plane-ui)
      require_service http://localhost:9000/health 'Local CF management'
      ;;
    ioc-scale-cf-demo-ce|ioc-scale-cf-template-ce)
      require_service http://localhost:9002/api/internal/diagnostics/health 'Local CFN'
      require_service http://localhost:8081/healthz 'SCOPE API'
      if [[ "$service" = ioc-scale-cf-demo-ce ]]; then
        prepare_demo_config
        export CF_LOCAL_CE_CONFIG_FILE="$CE_CONFIG_FILE"
        if [[ -n "${CE_MAS_FILE:-}" ]]; then
          [[ -f "$CE_MAS_FILE" ]] || fail "MAS file not found at $CE_MAS_FILE."
          export CF_LOCAL_CE_MAS_FILE="$CE_MAS_FILE"
        else
          mkdir -p "$local_dir/ce"
          touch "$local_dir/ce/mas-id"
        fi
      fi
      if cfn_runs_in_container; then
        export CF_LOCAL_CE_HOST="$service"
      else
        export CF_LOCAL_CE_HOST=127.0.0.1
      fi
      ;;
  esac
  if [[ "$service" = ioc-scale-cf-mgmt-plane-ui ]]; then
    require_env NEXTAUTH_SECRET
  fi
  # Pull first so management is checked against the version we will start.
  image_compose pull "$service"
  if [[ "$service" = ioc-scale-cf-mgmt-svc ]]; then
    image_compose run --rm --no-deps -T --entrypoint python3 "$service" - \
      < "$dev_dir/tools/check_mgmt_migrations.py"
  fi
  # Do not pull a different mutable tag after checking its migration graph.
  # Management's selected image runs its own Alembic entrypoint migrations.
  image_compose up --pull never --no-deps --force-recreate \
    --abort-on-container-exit --exit-code-from "$service" "$service"
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
  compose exec -T -e "LOCAL_CF_MGMT_DB=${LOCAL_CF_MGMT_DB:-cfn_mgmt_local}" ioc-scale-db sh -ec '
    export PGPASSWORD="$POSTGRES_PASSWORD"
    exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v mgmt_db="$LOCAL_CF_MGMT_DB"
  ' <<'SQL'
SELECT format('CREATE DATABASE %I', :'mgmt_db')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'mgmt_db') \gexec
SELECT 'CREATE DATABASE cfn_audit_local'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'cfn_audit_local') \gexec
SQL
}

require_cf_checkouts() {
  require_checkout "$api_dir" go.mod
  require_checkout "$cfn_dir" go.mod
  require_checkout "$mgmt_dir" pyproject.toml
  require_checkout "$ui_dir" package.json
  require_checkout "$samples_dir/template-ce" pyproject.toml
  require_checkout "$samples_dir/demo-ce" go.mod
  require_checkout "$samples_dir/noa-trip-planner" pyproject.toml
  [[ -f "$root_dir/go.work" ]] || fail "Missing root Go workspace."
}

prepare_management_test_db() {
  local running mapped_port
  require_local_env
  require_docker_compose
  require_tool poetry
  [[ ! -f "$mgmt_dir/.env" ]] || fail "The management checkout .env can override test database settings. Move it aside before running tests."

  running="$(compose ps --status running --services ioc-scale-db)" || fail "Could not inspect the local Postgres container."
  [[ "$running" = ioc-scale-db ]] || fail "Local Postgres is not running. Run 'task infra:up' before running CF tests."
  set_local_postgres
  mapped_port="$(compose port ioc-scale-db 5432)" || fail "Could not inspect the local Postgres port."
  [[ "${mapped_port##*:}" = "$POSTGRES_PORT" ]] || fail "Local Postgres is not published on port $POSTGRES_PORT. Check IOC_SCALE_DB_PORT in the root .env."
  export POSTGRES_DB=ioc_test

  # The management fixture recreates tables in ioc_test. Verify its target
  # before it can fall back to other local Postgres ports.
  (cd "$mgmt_dir" && poetry run python -c '
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
  require_tool npm
  require_tool task
  prepare_management_test_db

  printf 'CF tests: shared API and compatibility contracts\n'
  (cd "$api_dir" && make test)
  printf 'CF tests: CFN service\n'
  (cd "$cfn_dir" && make test)
  printf 'CF tests: management service (dedicated ioc_test database)\n'
  (cd "$mgmt_dir" && poetry run pytest tests/)
  printf 'CF tests: UI\n'
  (cd "$ui_dir" && npm test)
  printf 'CF tests: Go demo CE\n'
  (cd "$samples_dir/demo-ce" && go test -race ./...)
  printf 'CF tests: template CE\n'
  (cd "$samples_dir/template-ce" && uv run --frozen --extra test pytest)
  printf 'CF tests: NOA sample and declaration\n'
  (cd "$samples_dir/noa-trip-planner" && uv run --frozen --group dev python -m pytest tests -q)
  printf 'CF tests: local development tools and automation\n'
  (cd "$root_dir" && task test:dev)
}

run_cf_checks() {
  require_cf_checkouts
  require_local_env
  require_docker_compose
  require_tool task
  require_tool make
  require_tool npm
  [[ -x "$ui_dir/node_modules/.bin/tsc" ]] || fail "UI dependencies are missing. Run 'npm ci' in cf-ui."

  printf 'CF checks: shell and Compose configuration\n'
  bash -n "$dev_dir/cf-local.sh"
  compose config --quiet
  image_compose config --quiet
  printf 'CF checks: shared API formatting, vet, generated bindings and OpenAPI validation\n'
  (cd "$api_dir" && make lint proto-check openapi-check)
  printf 'CF checks: management formatting, lint and OpenAPI drift\n'
  (cd "$mgmt_dir" && task lint-check check-openapi-spec)
  printf 'CF checks: CFN formatting, vet and internal API docs\n'
  (cd "$cfn_dir" && make lint docs-check)
  printf 'CF checks: UI lint, Prettier, types and API drift\n'
  (cd "$ui_dir" && npm run lint:check && ./node_modules/.bin/tsc --noEmit && npm run check:api)
  printf 'CF checks: Go demo CE formatting and vet\n'
  (cd "$samples_dir/demo-ce" && [[ -z "$(gofmt -l .)" ]] && go vet ./...)
  run_cf_tests
}

# NOA source/image selection and enforcement mode are independent settings.
validate_noa_modes() {
  export NOA_MODE="${NOA_MODE:-source}"
  export NOA_ENFORCEMENT_MODE="${NOA_ENFORCEMENT_MODE:-direct}"
  [[ "$NOA_MODE" = published || "$NOA_MODE" = source ]] || fail "Invalid NOA_MODE '$NOA_MODE'. Use published or source."
  [[ "$NOA_ENFORCEMENT_MODE" = direct || "$NOA_ENFORCEMENT_MODE" = proxy ]] || fail "Invalid NOA_ENFORCEMENT_MODE '$NOA_ENFORCEMENT_MODE'. Use direct or proxy."
  [[ "$NOA_MODE:$NOA_ENFORCEMENT_MODE" != source:proxy ]] || fail "The current proxy requires native NOA A2A. Set NOA_MODE=published for proxy mode, or use NOA_ENFORCEMENT_MODE=direct with source NOA."
}

native_noa() {
  require_tool uv
  # Upstream parses RFC3339 nanoseconds, which macOS's system Python 3.9 rejects.
  # uv also puts the selected interpreter on PATH for the upstream Bash launcher.
  uv run --quiet --no-project --python '>=3.11' --no-python-downloads \
    python3 "$dev_dir/tools/noa_a2a.py" "$@"
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
    require_local_cf_containers
    compose up -d "${infra_services[@]}"
    ensure_local_databases
    ;;
  infra-down)
    require_local_env
    require_docker_compose
    require_local_cf_containers
    if [[ -f "$local_dir/noa-a2a/installation.env" ]]; then
      native_noa down
    fi
    running="$(running_cf_services)" || fail "Could not inspect local CF images."
    if [[ -n "$running" ]]; then
      # Only stop owned services; the standalone image file has no infra services.
      image_compose stop "${cf_services[@]}"
    fi
    compose stop "${infra_services[@]}"
    ;;
  run-cfn-mgmt-image)
    run_cf_image ioc-scale-cf-mgmt-svc 9000
    ;;
  run-cfn-image)
    run_cf_image ioc-scale-cfn-svc 9002 9003
    ;;
  run-cf-ui-image)
    run_cf_image ioc-scale-cf-mgmt-plane-ui 9001
    ;;
  run-demo-ce-image)
    run_cf_image ioc-scale-cf-demo-ce 18000 18001
    ;;
  run-template-ce-image)
    run_cf_image ioc-scale-cf-template-ce 50051 8080 8082
    ;;
  proxy-logs)
    require_local_env
    require_docker_compose
    native_noa logs
    ;;
  noa-down|noa-status)
    require_local_env
    require_docker_compose
    native_noa "${1#noa-}"
    ;;
  run-cfn-mgmt)
    require_local_env
    repo="$mgmt_dir"
    require_checkout "$repo" pyproject.toml
    require_docker_compose
    require_service_container_stopped ioc-scale-cf-mgmt-svc
    require_ports_free 9000
    [[ ! -f "$repo/.env" ]] || fail "$repo/.env overrides the database settings in management code. Remove or rename it before running local CF."
    require_tool poetry
    require_env ADMIN_USER_PASSWORD
    set_local_postgres
    export POSTGRES_DB="${LOCAL_CF_MGMT_DB:-cfn_mgmt_local}"
    unset ALEMBIC_DB_URL
    export CFN_SVC_URL=http://localhost:9002
    # The management app logs an admin API key when this is enabled.
    export CFN_DEV_MODE=False
    export CE_MONITOR_CHECK_INTERVAL_SECONDS="${CE_MONITOR_CHECK_INTERVAL_SECONDS:-1}"
    export CE_OFFLINE_THRESHOLD_SECONDS="${CE_OFFLINE_THRESHOLD_SECONDS:-3}"
    export PYTHONPATH="$repo/src"
    cd "$repo"
    poetry run python -c 'import alembic, fastapi, uvicorn' >/dev/null 2>&1 || fail "Management dependencies are missing. Run 'poetry install' in $repo."
    [[ "$POSTGRES_HOST:$POSTGRES_PORT/$POSTGRES_DB" = "localhost:${IOC_SCALE_DB_PORT:-5456}/${LOCAL_CF_MGMT_DB:-cfn_mgmt_local}" && -z "${ALEMBIC_DB_URL:-}" ]] || fail "Management migration target is not the local CF database."
    poetry run python "$dev_dir/tools/check_mgmt_migrations.py"
    poetry run alembic upgrade head
    require_service_container_stopped ioc-scale-cf-mgmt-svc
    exec poetry run uvicorn server.main:app --app-dir src --host "${LOCAL_CF_BIND_HOST:-127.0.0.1}" --port 9000 --reload
    ;;
  run-cfn)
    require_local_env
    repo="$cfn_dir"
    require_checkout "$repo" go.mod
    require_docker_compose
    require_service_container_stopped ioc-scale-cfn-svc
    require_ports_free 9002 9003
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
    require_service_container_stopped ioc-scale-cfn-svc
    exec go run ./cmd/cfn
    ;;
  run-cf-ui)
    require_local_env
    repo="$ui_dir"
    require_checkout "$repo" package.json
    require_docker_compose
    require_service_container_stopped ioc-scale-cf-mgmt-plane-ui
    require_ports_free 9001
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
    require_service_container_stopped ioc-scale-cf-mgmt-plane-ui
    exec npm run dev
    ;;
  run-full-mas)
    require_local_env
    validate_noa_modes
    mode="$NOA_MODE"
    require_docker_compose
    require_local_cf_containers
    if [[ "$mode:$NOA_ENFORCEMENT_MODE" = published:proxy ]]; then
      require_env NOA_MAS_ID AI_GATEWAY_BASE_URL AI_GATEWAY_API_KEY
      require_service http://localhost:9002/api/internal/diagnostics/health 'Local CFN'
      require_service "http://localhost:9002/api/multi-agentic-systems/$NOA_MAS_ID" 'Assigned NOA MAS (onboard it and wait for the CFN heartbeat)'
      native_noa up
    elif [[ "$mode" = published ]]; then
      compose --profile full-mas up --no-build --no-deps noa-trip-planner
    else
      repo="$samples_dir/noa-trip-planner"
      [[ -f "$repo/pyproject.toml" && -f "$repo/src/noa_trip_planner/enforcement.py" ]] || fail "Missing CF-owned NOA source at $repo. Check the monorepo sample files."
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
      cd "$repo"
      exec uv run --no-sync main
    fi
    ;;
  run-template-ce)
    require_local_env
    repo="$samples_dir/template-ce"
    require_checkout "$repo" pyproject.toml
    require_docker_compose
    require_service_container_stopped ioc-scale-cf-template-ce ioc-scale-cf-demo-ce
    require_ports_free 50051 8082 8080
    require_service http://localhost:9002/api/internal/diagnostics/health 'Local CFN'
    require_service http://localhost:8081/healthz 'SCOPE API'
    require_tool uv
    export CFN_URL=http://localhost:9002
    ce_host="$(source_ce_host)"
    export COGNITION_ENGINE_HOST="$ce_host"
    export GRPC_PORT=50051
    # Use 8082 for health because the SCOPE API uses 8081.
    export HEALTH_PORT=8082 HTTP_PORT=8080
    # Registration defaults belong to the CE; forward only an explicit name override.
    [[ -z "${TEMPLATE_CE_NAME:-}" ]] || export CE_NAME="$TEMPLATE_CE_NAME"
    export COGNITION_STORE_URL=http://localhost:8081
    cd "$repo"
    require_service_container_stopped ioc-scale-cf-template-ce ioc-scale-cf-demo-ce
    # Sync locked runtime dependencies after source updates, preserving installed extras.
    exec uv run --frozen python -m src
    ;;
  run-demo-ce)
    require_local_env
    repo="$samples_dir/demo-ce"
    require_checkout "$repo" go.mod
    prepare_demo_config
    require_docker_compose
    require_service_container_stopped ioc-scale-cf-demo-ce
    require_ports_free 18000 18001
    require_service http://localhost:9002/api/internal/diagnostics/health 'Local CFN'
    require_service http://localhost:8081/healthz 'SCOPE API'
    require_tool go
    export CFN_URL=http://localhost:9002
    export OXP_API_URL=http://localhost:8081
    bind_host="${LOCAL_CF_BIND_HOST:-127.0.0.1}"
    export GRPC_LISTEN_ADDRESS="$bind_host:18001"
    export HTTP_LISTEN_ADDRESS="$bind_host:18000"
    ce_host="$(source_ce_host)"
    export ADVERTISED_GRPC_ADDRESS="$ce_host:18001"
    # The CE registers the base URL and a separate /healthz endpoint.
    export ADVERTISED_HEALTH_URL="http://$ce_host:18000"
    # Registration defaults belong to the CE; forward only an explicit name override.
    [[ -z "${DEMO_CE_NAME:-}" ]] || export CE_NAME="$DEMO_CE_NAME"
    export CGO_ENABLED=0
    # Build against the root workspace without changing component module files.
    mkdir -p "$local_dir/tmp"
    build_dir="$(mktemp -d "$local_dir/tmp/cf-demo-ce.XXXXXX")"
    trap 'rm -rf "$build_dir"' EXIT
    cd "$repo"
    printf 'Building demo CE from %s (config: %s)\n' "$repo" "$CE_CONFIG_FILE"
    go build -o "$build_dir/demo-ce" ./cmd/demo-ce
    require_service_container_stopped ioc-scale-cf-demo-ce
    "$build_dir/demo-ce"
    ;;
  *)
    fail "Unknown action '${1:-}'. Use task --list for source/image service tasks, infrastructure, NOA, and proxy logs."
    ;;
esac

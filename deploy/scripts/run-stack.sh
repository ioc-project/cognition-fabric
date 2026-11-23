#!/usr/bin/env bash
# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

# Boot, inspect and stop the whole CF + OXP + enforcement proxy stack.
# Driven by the Makefile; run `make help` for the user-facing interface.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
stack_env="${STACK_ENV:-${root}/../.env}"
stack_compose="${root}/docker-compose.yml"
# Pinned so a checkout or worktree with another directory name still manages
# the same stack (fixed container_name values would otherwise collide) and the
# default network keeps the name the sibling enforcement proxy expects.
project="${COMPOSE_PROJECT_NAME:-ioc-scale-cf-deployment}"

usage() {
  cat <<'USAGE'
Usage: make up|down|status|logs|config|pull|doctor [profile=full-mas] [enforcement=envoy|shadi] [service=<name>]
       make help

Environment:
  STACK_ENV             environment file (default: .env)
  STACK_WAIT_TIMEOUT    seconds `up` waits for services to settle (default 180)
  COMPOSE_PROJECT_NAME  Compose project name (default: ioc-scale-cf-deployment)

`up` runs `docker compose up -d`, then waits until every container is running
(and healthy where a healthcheck exists) or has exited 0 (one-shot init jobs).
`down` stops and removes containers and the network, and preserves volumes.
`doctor` checks Docker, the environment file and the rendered Compose config.
profile=full-mas adds the NOA sample app, which needs AI_GATEWAY_API_KEY.
Demo CE needs a config file (demo-ce/config/config.json, or DEMO_CE_CONFIG_FILE).
enforcement=envoy|shadi adds one optional enforcement flavor from enforcement/;
it needs that flavor's config files (see enforcement/README.md). Only one flavor
at a time: `up` refuses while the other is present, so run `down` first. down,
status and logs always cover both.
USAGE
}

die() { echo "$*" >&2; exit 2; }

case "${1:-up}" in
  -h|--help|help) usage; exit 0 ;;
esac

action="${1:-up}"
shift || true
[[ $# -eq 0 ]] || die "${action} accepts no extra arguments"

profile="${STACK_PROFILE:-}"
case "${profile}" in
  ""|full-mas) ;;
  *) die "profile must be empty or full-mas" ;;
esac
enforcement="${STACK_ENFORCEMENT:-}"
case "${enforcement}" in
  ""|envoy|shadi) ;;
  *) die "enforcement must be empty, envoy or shadi" ;;
esac
# Profiles are additive; the explicit flag below is the only selection made here.
export COMPOSE_PROFILES=""
profile_args=()
[[ -z "${profile}" ]] || profile_args=(--profile "${profile}")
compose_base=(docker compose -p "${project}" --project-directory "${root}" --env-file "${stack_env}" -f "${stack_compose}")
# Selected flavor for up/config/pull/doctor.
compose=("${compose_base[@]}")
[[ -z "${enforcement}" ]] || compose+=(-f "${root}/enforcement/${enforcement}/compose.yaml")
# down/status/logs cover every flavor so nothing is left orphaned.
compose_all=("${compose_base[@]}" -f "${root}/enforcement/envoy/compose.yaml" -f "${root}/enforcement/shadi/compose.yaml")

# Read a literal KEY=value from the env file without sourcing it.
env_value() {
  awk -F= -v k="$1" '$1 == k { sub(/^[^=]*=/, ""); sub(/[[:space:]]+#.*$/, ""); v = $0 } END { print v }' "${stack_env}"
}

require_env() {
  [[ -f "${stack_env}" ]] || die "missing ${stack_env}; run: cp .env.example .env"
  command -v docker >/dev/null || die "docker is not installed"
  docker info >/dev/null 2>&1 || die "docker daemon is not reachable"
}

require_value() {
  local name="$1" value="${!1:-}"
  [[ -n "${value}" ]] || value="$(env_value "${name}")"
  [[ -n "${value}" ]] || die "missing required setting: ${name} (set it in ${stack_env})"
}

preflight() {
  require_env
  require_value IOC_SCALE_DB_USER
  require_value IOC_SCALE_DB_PASSWORD
  if [[ "${profile}" == "full-mas" ]]; then
    require_value AI_GATEWAY_API_KEY
  fi
  command -v python3 >/dev/null || die "python3 is required"
  local rendered
  rendered="$("${compose[@]}" ${profile_args[@]+"${profile_args[@]}"} config --format json)"
  # Use Compose's resolved mounts rather than parsing dotenv path settings again.
  python3 -c '
import json, pathlib, sys
try:
    services = json.load(sys.stdin)["services"]
    def mount(service, target):
        return pathlib.Path(next(v["source"] for v in services[service]["volumes"]
                                 if v["target"] == target))
    files = [mount("ioc-scale-cf-demo-ce", "/etc/demo-ce/config.json")]
    if sys.argv[1] == "shadi":
        directory = mount("ioc-scale-enforcement-proxy-shadi-verifier", "/run/shadi-verifier")
        files += [directory / name for name in ("config.json", "ca.crt", "server.crt", "server.key")]
    for path in files:
        if not path.is_file():
            raise ValueError("missing %s; see deploy/README.md and the selected enforcement README" % path)
    if sys.argv[1] == "shadi":
        activation = json.loads((directory / "config.json").read_text()).get("activation")
        if not isinstance(activation, dict) or not activation:
            raise ValueError("SHADi config requires an activation reference; see enforcement/shadi/README.md")
except (OSError, ValueError, KeyError, TypeError, StopIteration) as error:
    print("stack configuration: %s" % error, file=sys.stderr)
    sys.exit(2)
' "${enforcement}" <<< "${rendered}"
  if [[ "${enforcement}" == "envoy" ]]; then
    CF_DEPLOY_ENVOY_CONFIG_SHA256="$(python3 "${root}/scripts/prepare-envoy.py" <<< "${rendered}")"
    export CF_DEPLOY_ENVOY_CONFIG_SHA256
  fi
}

activation_note() {
  [[ -n "${enforcement}" ]] || return 0
  echo "${enforcement}: component startup does not attach a MAS; example activation is unprovisioned."
}

# Services an enforcement overlay adds on top of the base file.
flavor_services() {
  comm -13 \
    <("${compose_base[@]}" config --services 2>/dev/null | sort) \
    <("${compose_base[@]}" -f "${root}/enforcement/$1/compose.yaml" config --services 2>/dev/null | sort)
}

# Only one flavor may exist at a time. Containers of the other one count even when
# stopped (the installers exit 0 and stay), so switching needs `make down` first.
refuse_other_flavor() {
  [[ -n "${enforcement}" ]] || return 0
  local other existing
  case "${enforcement}" in envoy) other=shadi ;; shadi) other=envoy ;; esac
  existing="$("${compose_all[@]}" --profile '*' ps --all --services 2>/dev/null | sort)"
  if [[ -n "$(comm -12 <(printf '%s\n' "${existing}") <(flavor_services "${other}") )" ]]; then
    die "enforcement flavor '${other}' is present; run 'make down' before starting '${enforcement}' (one flavor at a time)"
  fi
}

selected_services() {
  "${compose[@]}" ${profile_args[@]+"${profile_args[@]}"} config --services
}

# Poll until each container is running/healthy, or exited 0. Workers that lack
# API keys restart in a loop, so a timeout names the offenders instead of hanging.
wait_for_stack() {
  local timeout="${STACK_WAIT_TIMEOUT:-180}"
  [[ "${timeout}" =~ ^[1-9][0-9]*$ ]] || die "STACK_WAIT_TIMEOUT must be positive seconds"
  local deadline=$((SECONDS + timeout)) pending service
  # The project name is shared with the enforcement proxy demos, so restrict the
  # check to this file's own services and ignore containers from other files.
  local services=()
  while IFS= read -r service; do
    services+=("${service}")
  done < <(selected_services)
  while :; do
    pending="$("${compose[@]}" ${profile_args[@]+"${profile_args[@]}"} ps --all --format json "${services[@]}" | python3 -c '
import json, sys
raw = sys.stdin.read().strip()
rows = json.loads(raw) if raw.startswith("[") else [json.loads(l) for l in raw.splitlines() if l.strip()]
seen = set()
for r in rows:
    seen.add(r.get("Service"))
    state, health, code = r.get("State", ""), r.get("Health", ""), r.get("ExitCode", 0)
    ok = (state == "running" and health in ("", "healthy")) or (state == "exited" and code == 0)
    if not ok:
        print("%s (%s%s)" % (r.get("Service"), state, "/" + health if health else ""))
for name in sys.argv[1:]:
    if name not in seen:
        print("%s (not created)" % name)
' "${services[@]}")"
    [[ -n "${pending}" ]] || { echo "stack is up"; return 0; }
    if (( SECONDS >= deadline )); then
      echo "not ready after ${timeout}s:" >&2
      echo "${pending}" | sed 's/^/  /' >&2
      echo "inspect with: make logs service=<name>" >&2
      return 1
    fi
    sleep 3
  done
}

case "${action}" in
  up)
    require_env
    refuse_other_flavor
    preflight
    up_services=()
    while IFS= read -r service; do up_services+=("${service}"); done < <(selected_services)
    "${compose[@]}" ${profile_args[@]+"${profile_args[@]}"} up -d "${up_services[@]}"
    wait_for_stack
    activation_note
    ;;
  down)
    require_env
    # '*' also covers profiled services started with profile=full-mas.
    "${compose_all[@]}" --profile '*' down
    ;;
  status)
    require_env
    "${compose_all[@]}" --profile '*' ps --all
    ;;
  logs)
    require_env
    "${compose_all[@]}" --profile '*' logs --tail "${STACK_LOG_TAIL:-200}" -f ${STACK_SERVICE:+"${STACK_SERVICE}"}
    ;;
  config)
    require_env
    "${compose[@]}" ${profile_args[@]+"${profile_args[@]}"} config
    ;;
  pull)
    require_env
    "${compose[@]}" ${profile_args[@]+"${profile_args[@]}"} pull
    ;;
  doctor)
    preflight
    echo "docker: ok"
    echo "env file: ${stack_env}"
    echo "compose config: ok"
    activation_note
    echo "images:"
    "${compose[@]}" ${profile_args[@]+"${profile_args[@]}"} config --images | sort -u | sed 's/^/  /'
    ;;
  *) usage >&2; exit 2 ;;
esac

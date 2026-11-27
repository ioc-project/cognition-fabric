# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Run the bundled NOA A2A app with the upstream Proxy runtime."""

import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import urllib.error
import uuid


ROOT = Path(__file__).resolve().parents[2]
REVISION = "c98680b4c957dcd126b9516ccb5cdaa024261483"
NOA_SAMPLE = Path("samples/noa-trip-planner-a2a")
RUNTIME_FILES = (
    "scripts/lib/literal_dotenv.py",
    "scripts/lib/enforcement-images.sh",
    "scripts/runtime/run-enforcement-proxy-runtime.sh",
    "scripts/runtime/adapter_controller.py",
    "scripts/runtime/native_storage.py",
    "deployments/compose/enforcement-proxy-runtime/compose.yaml",
    "LICENSE.txt",
)
AGENTS = ("noa-moderator", "noa-schedule-agent", "noa-itinerary-agent", "noa-concierge-agent")
IMAGE_SELECTORS = (
    ("SIDECAR_IMAGE", "NOA_PROXY_SIDECAR_TAG", "ioc-sidecar"),
    ("TRACEPARENT_WASM_IMAGE", "NOA_PROXY_WASM_TAG", "ioc-wasm"),
    ("OPERATOR_DOCKER_IMAGE", "NOA_PROXY_OPERATOR_TAG", "ioc-operator-docker"),
    ("MCP_GUARD_IMAGE", "NOA_PROXY_MCP_GUARD_TAG", "ioc-mcp-ingress-guard"),
)


def private_write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name(path.name + ".new")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        os.fchmod(stream.fileno(), 0o600)
        stream.write(content)
    temporary.replace(path)


def runtime_source(root=ROOT):
    """Cache the reviewed upstream entry point and its dependencies, unchanged."""
    directory = root / ".local/proxy-runtime" / REVISION
    if all((directory / name).is_file() for name in RUNTIME_FILES):
        return directory
    directory.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix="download-", dir=directory.parent))
    try:
        for name in RUNTIME_FILES:
            url = f"https://raw.githubusercontent.com/ioc-project/enforcement-proxy/{REVISION}/{name}"
            try:
                with urllib.request.urlopen(url, timeout=30) as response:
                    data = response.read(2_000_001)
            except urllib.error.HTTPError as error:
                if error.code not in (401, 403, 404) or not shutil.which("gh"):
                    raise ValueError("Upstream runtime download needs repository access; authenticate gh") from error
                # GitHub returns 404 for private content. Let gh use its existing
                # credentials without extracting or printing the token.
                result = subprocess.run(
                    ["gh", "api", f"repos/ioc-project/enforcement-proxy/contents/{name}?ref={REVISION}",
                     "--header", "Accept: application/vnd.github.raw+json"],
                    capture_output=True, check=False,
                )
                if result.returncode:
                    raise ValueError("Cannot read upstream runtime; check gh repository access")
                data = result.stdout
            if not data or len(data) > 2_000_000:
                raise ValueError(f"Invalid upstream runtime file: {name}")
            target = temporary / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        if directory.exists():
            shutil.rmtree(directory)
        temporary.replace(directory)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
    return directory


def reference(settings, full, tag, repository, registry):
    return settings.get(full) or f"{registry.rstrip('/')}/{repository}:{settings.get(tag) or 'latest'}"


def installation(settings, state, source, root=ROOT):
    project = (settings.get("COMPOSE_PROJECT_NAME") or "ioc-scale-cf-deployment") + "-noa-a2a"
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", project):
        raise ValueError("COMPOSE_PROJECT_NAME must be a valid Compose project name")
    registry = settings.get("PROXY_REGISTRY") or "ghcr.io/ioc-project"
    values = {key: reference(settings, key, tag, repository, registry)
              for key, tag, repository in IMAGE_SELECTORS}
    values.update(
        RUNTIME_ADAPTER="envoy",
        # Reuse the images prepared before enrollment.
        RUNTIME_IMAGES="local",
        RUNTIME_STATE_DIRECTORY=str(state / ".ioc-runtime"),
        RUNTIME_ENVOY_TRUSTED_INGRESS_PEERS=json.dumps({"noa-moderator": ["api"]}),
        COMPOSE_PROJECT_NAME=project,
        COMPOSE_FILE=str(root / "dev/compose/noa-a2a.yaml"),
        COMPOSE_ENV_FILES="",
        RUNTIME_IDENTITY_FILE=str(state / "identities.json"),
        NOA_A2A_IMAGE=f"local/{project}:dev",
        NOA_A2A_PLATFORM=settings.get("NOA_A2A_PLATFORM") or "linux/amd64",
        NOA_API_PORT=settings.get("NOA_API_PORT") or "8125",
        ENFORCEMENT_PLATFORM=settings.get("ENFORCEMENT_PLATFORM") or "linux/arm64",
        CF_ENFORCEMENT_ADDRESS="host.docker.internal:9003",
        CF_ENFORCEMENT_ALLOW_PLAINTEXT="true",
        CF_ENFORCEMENT_TIMEOUT=settings.get("CF_ENFORCEMENT_TIMEOUT") or "2s",
        ENFORCEMENT_FAILURE_POSTURE="fail_closed",
        MAX_MEDIATED_BODY_BYTES=settings.get("MAX_MEDIATED_BODY_BYTES") or "1048576",
        AUDIT_CAPTURE_MAX_BYTES=settings.get("AUDIT_CAPTURE_MAX_BYTES") or "65536",
        AUDIT_REDACT_PATTERNS=settings.get("AUDIT_REDACT_PATTERNS") or "[]",
        AUDIT_QUEUE_CAPACITY=settings.get("AUDIT_QUEUE_CAPACITY") or "256",
        AUDIT_RPC_TIMEOUT=settings.get("AUDIT_RPC_TIMEOUT") or "2s",
    )
    for key in ("AI_GATEWAY_BASE_URL", "AI_GATEWAY_API_KEY", "NOA_LLM_MODEL"):
        if not settings.get(key):
            raise ValueError(f"Set {key} in the root .env")
        values[key] = settings[key]
    values["NOA_OTLP_UPSTREAM"] = settings.get("NOA_OTLP_UPSTREAM") or "http://host.docker.internal:4318"
    port = int(values["NOA_API_PORT"])
    if not 1 <= port <= 65535:
        raise ValueError("NOA_API_PORT must be between 1 and 65535")
    return values


def identity(settings, project, root=ROOT):
    selected = settings.get("NOA_IDENTITY_FILE")
    if selected:
        path = Path(selected)
        path = path if path.is_absolute() else root / path
        document = json.loads(path.read_text())
        if not isinstance(document, dict):
            raise ValueError("NOA_IDENTITY_FILE must contain a canonical identity object")
        if settings.get("NOA_MAS_ID") and document.get("mas_id") != settings["NOA_MAS_ID"]:
            raise ValueError("NOA_IDENTITY_FILE and NOA_MAS_ID select different MAS IDs")
        # The upstream controller validates the complete canonical artifact.
        return document
    mas_id = settings.get("NOA_MAS_ID") or ""
    uuid.UUID(mas_id)
    mcp_id = settings.get("NOA_MCP_SERVER_ID")
    if not mcp_id:
        raise ValueError("Set NOA_MCP_SERVER_ID to the MCP server ID returned by onboarding")
    return {
        "workspace": "default", "mas_id": mas_id,
        "workloads": [
            {"workload_ref": f"compose:{project}/service:{name}", "kind": "agent", "agent_id": name}
            for name in AGENTS
        ] + [{"workload_ref": f"compose:{project}/service:noa-mcp",
              "kind": "mcp_server", "mcp_server_id": mcp_id}],
        "external_destinations": [{"setting": "AI_GATEWAY_BASE_URL", "agent_id": "noa-llm"}],
    }


def run(command, **options):
    return subprocess.run(command, check=True, **options)


def wait_api(port):
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/ready", timeout=2) as response:
                if response.status == 200:
                    return
        except (OSError, urllib.error.HTTPError):
            pass
        time.sleep(1)
    raise ValueError("NOA API did not become ready; inspect 'task noa:status' and 'task proxy:logs'")


def ownership(project, directory, stopped=False):
    ids = subprocess.check_output(
        ["docker", "ps", "-aq", "--filter", f"label=com.docker.compose.project={project}"],
        text=True,
    ).split()
    if not ids:
        return
    projection = ('{"directory":{{json (index .Config.Labels "com.docker.compose.project.working_dir")}},'
                  '"running":{{json .State.Running}}}')
    rows = subprocess.check_output(["docker", "inspect", "--format", projection, *ids], text=True)
    for line in rows.splitlines():
        row = json.loads(line)
        if row["directory"] != str(directory):
            raise ValueError("The NOA Compose project belongs to another checkout/workflow")
        if stopped and row["running"]:
            raise ValueError("NOA A2A is already running; stop its task or run 'task noa:down' first")


def compose(values, source):
    return ["docker", "compose", "--project-directory", str(Path(values["COMPOSE_FILE"]).parent),
            "--project-name", values["COMPOSE_PROJECT_NAME"], "--env-file", values["_env_file"],
            "-f", values["COMPOSE_FILE"], "-f",
            str(source / "deployments/compose/enforcement-proxy-runtime/compose.yaml"),
            "--profile", "envoy"]


def execute(action, settings=None, root=ROOT):
    settings = dict(os.environ if settings is None else settings)
    state = root / ".local/noa-a2a"
    env_file = state / "installation.env"
    if action in ("down", "logs", "status") and not env_file.is_file():
        print("NOA A2A has not been started from this checkout.")
        return
    source = runtime_source(root)
    # Reuse upstream's literal dotenv parser; never source environment files.
    import importlib.util
    spec = importlib.util.spec_from_file_location("noa_literal_dotenv", source / RUNTIME_FILES[0])
    parser = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(parser)
    environment = dict(os.environ)
    environment.pop("GITHUB_TOKEN", None)
    environment.pop("DOCKER_DEFAULT_PLATFORM", None)
    environment["RUNTIME_ENV"] = str(env_file)
    environment["RUNTIME_STATE_DIRECTORY"] = str(state / ".ioc-runtime")
    environment["DEV_BUILD"] = "false"
    environment["PYTHON"] = sys.executable
    launcher = ["bash", str(source / "scripts/runtime/run-enforcement-proxy-runtime.sh")]
    if action == "up":
        state.mkdir(parents=True, exist_ok=True, mode=0o700)
        with (state / "launcher.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            if env_file.is_file():
                status = json.loads(subprocess.check_output(
                    launcher + ["status"], cwd=state, env=environment, text=True,
                ))
                if status.get("deployments"):
                    raise ValueError("NOA is still enrolled; run 'task noa:down' before starting again")
            values = installation(settings, state, source, root)
            ownership(values["COMPOSE_PROJECT_NAME"], Path(values["COMPOSE_FILE"]).parent, stopped=True)
            document = identity(settings, values["COMPOSE_PROJECT_NAME"], root)
            run(["python3", str(root / "dev/tools/check_ports.py"), values["NOA_API_PORT"]])
            environment.update(values)
            candidate = state / "installation-candidate.env"
            content = "".join(f"{key}={json.dumps(value)}\n" for key, value in values.items())
            try:
                private_write(candidate, content)
                values["_env_file"] = str(candidate)
                run(compose(values, source) + ["config", "--quiet"], env=environment)
                # Prepare images before publishing controller inputs or starting helpers.
                run(["docker", "build", "--platform", values["NOA_A2A_PLATFORM"],
                     "--tag", values["NOA_A2A_IMAGE"], str(root / NOA_SAMPLE)], env=environment)
                for key in ("MCP_GUARD_IMAGE", "SIDECAR_IMAGE", "TRACEPARENT_WASM_IMAGE"):
                    run(["docker", "pull", "--platform", values["ENFORCEMENT_PLATFORM"],
                         values[key]], env=environment)
                run(["docker", "pull", values["OPERATOR_DOCKER_IMAGE"]], env=environment)
                run(["docker", "pull", "--platform", values["ENFORCEMENT_PLATFORM"],
                     "envoyproxy/envoy:contrib-v1.38.0"], env=environment)
                run(["docker", "pull", "otel/opentelemetry-collector-contrib:0.121.0"], env=environment)
                run(["docker", "pull", "nginx:alpine"], env=environment)
                private_write(state / "identities.json", json.dumps(document, indent=2) + "\n")
                private_write(env_file, content)
            finally:
                candidate.unlink(missing_ok=True)
            values["_env_file"] = str(env_file)
            command = compose(values, source)
            run(command + ["up", "-d", "--pull", "never", "mcp-network",
                           "mcp-ingress-guard", "telemetry-relay", "api"], env=environment)
            run(launcher + ["up"], cwd=state, env=environment)
            wait_api(values["NOA_API_PORT"])
        print(f"NOA A2A ready at http://127.0.0.1:{values['NOA_API_PORT']}; Ctrl+C stops this MAS.")
        try:
            run(launcher + ["logs"], cwd=state, env=environment)
        except KeyboardInterrupt:
            pass
        finally:
            execute("down", settings, root)
    else:
        values = parser.load([env_file])
        environment.update(values)
        values["_env_file"] = str(env_file)
        ownership(values["COMPOSE_PROJECT_NAME"], Path(values["COMPOSE_FILE"]).parent)
        if action == "down":
            run(launcher + ["down"], cwd=state, env=environment)
            run(compose(values, source) + ["down", "--remove-orphans"], env=environment)
        elif action == "logs":
            run(launcher + ["logs"], cwd=state, env=environment)
        else:
            run(launcher + ["status"], cwd=state, env=environment)
            run(compose(values, source) + ["ps", "-a"], env=environment)


def main():
    argument = argparse.ArgumentParser(description=__doc__)
    argument.add_argument("action", choices=("up", "down", "logs", "status"))
    args = argument.parse_args()
    try:
        execute(args.action)
    except KeyboardInterrupt:
        if args.action == "up":
            execute("down")
        argument.exit(130)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        argument.exit(1, f"NOA A2A: {error}\n")


if __name__ == "__main__":
    main()

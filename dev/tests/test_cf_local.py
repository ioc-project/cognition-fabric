# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Exercise launcher decisions without starting containers or source services.

Run: python3 -m unittest discover -s dev/tests -v
"""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


RUNNER = Path(__file__).resolve().parents[1] / "cf-local.sh"
ROOT_DIR = RUNNER.parent.parent
FAKE_TOOL = r'''
import json
import os
from pathlib import Path
import sys

name = Path(sys.argv[0]).name
args = sys.argv[1:]
keys = (
    "POSTGRES_DB", "POSTGRES_AUDIT_DB", "COGNITION_ENGINE_HOST",
    "ADVERTISED_GRPC_ADDRESS", "ADVERTISED_HEALTH_URL", "CF_LOCAL_CE_HOST",
    "CF_LOCAL_CE_CONFIG_FILE", "CF_LOCAL_CE_MAS_FILE", "CFN_SVC_TAG",
    "CF_MGMT_SVC_TAG", "CF_UI_TAG", "CF_DEMO_CE_TAG", "NOA_CFN_GRPC_TARGET",
    "GRPC_LISTEN_ADDRESS", "HTTP_LISTEN_ADDRESS", "LOCAL_CF_MGMT_DB", "GOWORK", "CF_LOCAL_ENV_FILE",
)
with open(os.environ["MOCK_LOG"], "a") as log:
    log.write(json.dumps({"tool": name, "args": args, "cwd": os.getcwd(),
                         "env": {key: os.environ.get(key) for key in keys}}) + "\n")
if name == "docker":
    if args[0] == "inspect":
        print("false" if args[-1] == os.environ.get("MOCK_UNOWNED") else "true")
    elif "ps" in args and "--services" in args:
        if os.environ.get("MOCK_PS_FAIL"):
            sys.exit(1)
        services = set(args[args.index("--services") + 1:])
        running = os.environ.get("MOCK_RUNNING", "").split(",")
        print("\n".join(service for service in running if service in services))
    elif "port" in args:
        print("127.0.0.1:5456")
    elif "run" in args and "--entrypoint" in args:
        sys.stdin.read()
        sys.exit(int(os.environ.get("MOCK_MIGRATION_EXIT", "0")))
    elif "up" in args:
        sys.exit(int(os.environ.get("MOCK_UP_EXIT", "0")))
elif name == "curl" and args[-1] == os.environ.get("MOCK_HTTP_FAILURE_URL"):
    sys.exit(22)
elif name == "python3" and args and args[0].endswith("check_ports.py"):
    if os.environ.get("MOCK_BUSY_PORT") in args[1:]:
        print("Local CF: Port is in use", file=sys.stderr)
        sys.exit(1)
elif name == "poetry" and args[-1].endswith("check_mgmt_migrations.py"):
    sys.exit(int(os.environ.get("MOCK_MIGRATION_EXIT", "0")))
elif name == "go" and args[0] == "build":
    target = Path(args[args.index("-o") + 1])
    target.write_text(Path(__file__).read_text())
    target.chmod(0o755)
'''


class LocalLauncherTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        workspace = Path(self.temporary.name).resolve()
        self.cfn = workspace / "cognition-fabric"
        self.runner = self.cfn / "dev/cf-local.sh"
        self.runner.parent.mkdir(parents=True)
        shutil.copyfile(RUNNER, self.runner)
        for helper in ("check_ports.py", "check_mgmt_migrations.py", "noa_a2a.py"):
            (self.runner.parent / "tools").mkdir(exist_ok=True)
            shutil.copyfile(RUNNER.parent / "tools" / helper, self.runner.parent / "tools" / helper)
        shutil.copyfile(ROOT_DIR / "Taskfile.yml", self.cfn / "Taskfile.yml")
        (self.cfn / ".env").touch()
        (self.cfn / "go.work").touch()
        deployment = self.cfn / "deploy"
        deployment.mkdir()
        (deployment / "docker-compose.yml").touch()
        for repo, marker in [
            ("api", "go.mod"),
            ("cfn", "go.mod"),
            ("cf-mgmt", "pyproject.toml"),
            ("cf-ui", "package.json"),
            ("samples/template-ce", "pyproject.toml"),
            ("samples/demo-ce", "go.mod"),
            ("samples/demo-ce", "go.sum"),
        ]:
            path = self.cfn / repo / marker
            path.parent.mkdir(parents=True, exist_ok=True)
            path.touch()
        (self.cfn / "policy.json").write_text('{"mas": []}')
        noa = self.cfn / "samples/noa-trip-planner"
        (noa / "src/noa_trip_planner").mkdir(parents=True)
        (noa / "src/noa_trip_planner/enforcement.py").touch()
        (noa / "pyproject.toml").touch()
        (noa / ".venv").mkdir()
        binaries = workspace / "bin"
        binaries.mkdir()
        tool = binaries / "fake-tool"
        tool.write_text(f"#!{sys.executable}\n" + FAKE_TOOL)
        tool.chmod(0o755)
        for name in ("docker", "curl", "python3", "go", "uv", "poetry", "make", "npm", "task"):
            (binaries / name).symlink_to(tool)
        typescript = self.cfn / "cf-ui/node_modules/.bin/tsc"
        typescript.parent.mkdir(parents=True)
        typescript.symlink_to(tool)
        self.log = workspace / "commands.jsonl"
        self.env = dict(os.environ)
        # Do not inherit developer configuration into the fixtures.
        for key in list(self.env):
            if key.startswith(("CF_", "CFN_", "CE_", "NOA_", "MOCK_", "LOCAL_CF_")):
                del self.env[key]
        self.env.update(
            PATH=f"{binaries}:{os.environ['PATH']}",
            MOCK_LOG=str(self.log),
            MOCK_RUNNING="ioc-scale-db,otel-collector",
            IOC_SCALE_DB_USER="test",
            IOC_SCALE_DB_PASSWORD="test",
            ADMIN_USER_PASSWORD="test",
            NEXTAUTH_SECRET="test",
            CE_CONFIG_FILE="policy.json",
            AI_GATEWAY_BASE_URL="http://example.invalid/v1",
            AI_GATEWAY_API_KEY="test",
            NOA_MAS_ID="00000000-0000-0000-0000-000000000001",
        )

    def run_task(self, action, **settings):
        return subprocess.run(
            ["bash", str(self.runner), action],
            env=self.env | settings, capture_output=True, text=True,
        )

    def commands(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def last_up(self):
        return next(command for command in reversed(self.commands())
                    if command["tool"] == "docker" and "up" in command["args"])

    def test_deployment_is_bundled_in_the_monorepo(self):
        deployment = self.cfn / "deploy"
        result = self.run_task("infra-up")
        self.assertEqual(result.returncode, 0, result.stderr)
        commands = [x for x in self.commands() if "--project-directory" in x["args"]]
        self.assertTrue(commands)
        for command in commands:
            args = command["args"]
            self.assertEqual(args[args.index("--project-directory") + 1], str(deployment))
            self.assertIn(str(deployment / "docker-compose.yml"), args)
            self.assertEqual(command["cwd"], str(deployment))

    def test_missing_bundled_compose_fails_before_docker(self):
        (self.cfn / "deploy/docker-compose.yml").unlink()
        result = self.run_task("infra-up")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("docker-compose.yml", result.stderr)
        self.assertIn("Restore deploy/", result.stderr)
        self.assertFalse(self.log.exists())

    def test_each_image_starts_only_selected_service_and_preserves_tag(self):
        for task, service, tag in [
            ("cfn-mgmt", "ioc-scale-cf-mgmt-svc", "CF_MGMT_SVC_TAG"),
            ("cfn", "ioc-scale-cfn-svc", "CFN_SVC_TAG"),
            ("cf-ui", "ioc-scale-cf-mgmt-plane-ui", "CF_UI_TAG"),
            ("demo-ce", "ioc-scale-cf-demo-ce", "CF_DEMO_CE_TAG"),
        ]:
            with self.subTest(task=task):
                result = self.run_task(f"run-{task}-image", **{tag: "123"})
                self.assertEqual(result.returncode, 0, result.stderr)
                command = self.last_up()
                self.assertEqual(command["env"][tag], "123")
                self.assertEqual(command["args"][-9:], [
                    "up", "--pull", "never", "--no-deps", "--force-recreate",
                    "--abort-on-container-exit", "--exit-code-from", service, service,
                ])
                self.assertTrue(any(command["args"][-2:] == ["pull", service]
                                    for command in self.commands()))

    def test_refuses_busy_source_port_before_pulling_image(self):
        result = self.run_task("run-cfn-mgmt-image", MOCK_BUSY_PORT="9000")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("in use", result.stderr)
        self.assertFalse(any("up" in command["args"] for command in self.commands()))

    def test_refuses_running_counterpart(self):
        for task in ("run-cfn", "run-cfn-image"):
            with self.subTest(task=task):
                result = self.run_task(task, MOCK_RUNNING="ioc-scale-cfn-svc")
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("already running", result.stderr)

    def test_platform_tasks_reject_unowned_deployment(self):
        for action, mode in [("infra-up", "published"), ("infra-down", "published"),
                             ("run-full-mas", "published"), ("run-full-mas", "source")]:
            with self.subTest(action=action, mode=mode):
                self.log.unlink(missing_ok=True)
                result = self.run_task(action, NOA_MODE=mode, NOA_ENFORCEMENT_MODE="direct",
                                       MOCK_RUNNING="ioc-scale-cfn-svc", MOCK_UNOWNED="ioc-scale-cfn-svc")
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("published deployment", result.stderr)
                self.assertFalse(any(c["tool"] == "uv" or {"up", "stop", "exec"} & set(c["args"])
                                     for c in self.commands()))

    def test_source_cfn_accepts_local_management_image(self):
        result = self.run_task("run-cfn", MOCK_RUNNING="ioc-scale-cf-mgmt-svc")
        self.assertEqual(result.returncode, 0, result.stderr)
        command = self.commands()[-1]
        self.assertEqual(command["tool"], "go")
        self.assertEqual(command["env"]["POSTGRES_AUDIT_DB"], "cfn_audit_local")

    def test_migration_mismatch_blocks_source_and_image_startup(self):
        for task in ("run-cfn-mgmt", "run-cfn-mgmt-image"):
            with self.subTest(task=task):
                self.log.unlink(missing_ok=True)
                result = self.run_task(task, MOCK_MIGRATION_EXIT="18")
                self.assertEqual(result.returncode, 18, result.stderr)
                self.assertFalse(any("up" in command["args"] for command in self.commands()))
                self.assertFalse(any("alembic" in command["args"] for command in self.commands()))

    def test_image_checks_migrations_after_pull_before_entrypoint_start(self):
        result = self.run_task("run-cfn-mgmt-image")
        self.assertEqual(result.returncode, 0, result.stderr)
        commands = self.commands()
        pull = next(i for i, command in enumerate(commands) if "pull" in command["args"])
        check = next(i for i, command in enumerate(commands) if "--entrypoint" in command["args"])
        up = next(i for i, command in enumerate(commands) if "up" in command["args"])
        self.assertLess(pull, check)
        self.assertLess(check, up)
        self.assertIn("--no-deps", commands[check]["args"])
        self.assertIn("-T", commands[check]["args"])

    def test_management_selects_explicit_local_database(self):
        result = self.run_task("run-cfn-mgmt", LOCAL_CF_MGMT_DB="cfn_mgmt_image")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.commands()[-1]["env"]["POSTGRES_DB"], "cfn_mgmt_image")

    def test_infra_forwards_database_selection_as_environment_not_sql(self):
        result = self.run_task("infra-up", LOCAL_CF_MGMT_DB="cfn_mgmt_image")
        self.assertEqual(result.returncode, 0, result.stderr)
        initialize = next(command for command in self.commands()
                          if command["tool"] == "docker" and "exec" in command["args"])
        args = initialize["args"]
        self.assertEqual(args[args.index("-e") + 1], "LOCAL_CF_MGMT_DB=cfn_mgmt_image")
        self.assertEqual(initialize["env"]["CF_LOCAL_ENV_FILE"], str(self.cfn / ".env"))
        self.assertIn(str(self.cfn / "dev/compose/infrastructure.override.yaml"), args)

    def test_source_services_default_to_loopback_and_allow_explicit_wider_bind(self):
        for settings, host in [({}, "127.0.0.1"), ({"LOCAL_CF_BIND_HOST": "0.0.0.0"}, "0.0.0.0")]:
            with self.subTest(host=host):
                result = self.run_task("run-cfn-mgmt", **settings)
                self.assertEqual(result.returncode, 0, result.stderr)
                args = self.commands()[-1]["args"]
                self.assertEqual(args[args.index("--host") + 1], host)
                result = self.run_task("run-demo-ce", **settings)
                self.assertEqual(result.returncode, 0, result.stderr)
                env = self.commands()[-1]["env"]
                self.assertEqual(env["GRPC_LISTEN_ADDRESS"], host + ":18001")
                self.assertEqual(env["HTTP_LISTEN_ADDRESS"], host + ":18000")

    def test_ce_image_advertises_for_active_cfn_and_resolves_policy(self):
        for running, host in [("ioc-scale-db", "127.0.0.1"),
                              ("ioc-scale-db,ioc-scale-cfn-svc", "ioc-scale-cf-demo-ce")]:
            with self.subTest(host=host):
                result = self.run_task("run-demo-ce-image", MOCK_RUNNING=running)
                self.assertEqual(result.returncode, 0, result.stderr)
                env = self.last_up()["env"]
                self.assertEqual(env["CF_LOCAL_CE_HOST"], host)
                self.assertEqual(env["CF_LOCAL_CE_CONFIG_FILE"], str(self.cfn / "policy.json"))

    def test_source_ce_advertises_for_image_cfn(self):
        for action, key, expected in [
            ("run-template-ce", "COGNITION_ENGINE_HOST", "host.docker.internal"),
            ("run-demo-ce", "ADVERTISED_GRPC_ADDRESS", "host.docker.internal:18001"),
        ]:
            with self.subTest(action=action):
                result = self.run_task(action, MOCK_RUNNING="ioc-scale-cfn-svc")
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(self.commands()[-1]["env"][key], expected)

    def test_published_noa_proxy_accepts_both_platforms(self):
        mas_url = "http://localhost:9002/api/multi-agentic-systems/" + self.env["NOA_MAS_ID"]
        for unowned in ("", "ioc-scale-cfn-svc"):
            with self.subTest(makefile=bool(unowned)):
                self.log.unlink(missing_ok=True)
                result = self.run_task(
                    "run-full-mas", NOA_MODE="published", NOA_ENFORCEMENT_MODE="proxy",
                    MOCK_RUNNING="ioc-scale-cfn-svc,otel-collector", MOCK_UNOWNED=unowned,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                commands = self.commands()
                self.assertEqual([c["args"][-1] for c in commands if c["tool"] == "curl"], [
                    "http://localhost:9002/api/internal/diagnostics/health", mas_url,
                ])
                self.assertEqual([c["args"] for c in commands if c["tool"] == "docker"], [["compose", "version"]])
                command = commands[-1]
                self.assertEqual(command["tool"], "uv")
                args = command["args"]
                self.assertEqual(args[-1], "up")
                self.assertEqual(args[args.index("--python") + 1], ">=3.11")
                self.assertIn("--no-project", args)
                self.assertIn("--no-python-downloads", args)
                self.assertTrue(args[args.index("python3") + 1].endswith("tools/noa_a2a.py"))

    def test_published_noa_proxy_checks_platform_before_enrollment(self):
        for path, message in [
            ("/api/internal/diagnostics/health", "CFN is not ready"),
            ("/api/multi-agentic-systems/" + self.env["NOA_MAS_ID"], "Assigned NOA MAS"),
        ]:
            with self.subTest(path=path):
                self.log.unlink(missing_ok=True)
                result = self.run_task(
                    "run-full-mas", NOA_MODE="published", NOA_ENFORCEMENT_MODE="proxy",
                    MOCK_HTTP_FAILURE_URL="http://localhost:9002" + path,
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(message, result.stderr)
                self.assertFalse(any(c["tool"] == "uv" for c in self.commands()))

    def test_native_noa_lifecycle_delegates_with_makefile_platform(self):
        for action, verb in [("noa-status", "status"), ("proxy-logs", "logs"), ("noa-down", "down")]:
            with self.subTest(action=action):
                self.log.unlink(missing_ok=True)
                result = self.run_task(action, MOCK_RUNNING="ioc-scale-cfn-svc",
                                       MOCK_UNOWNED="ioc-scale-cfn-svc")
                self.assertEqual(result.returncode, 0, result.stderr)
                commands = self.commands()
                self.assertEqual([c["args"] for c in commands if c["tool"] == "docker"], [["compose", "version"]])
                self.assertEqual(commands[-1]["tool"], "uv")
                self.assertEqual(commands[-1]["args"][-2:], [str(self.cfn / "dev/tools/noa_a2a.py"), verb])

    def test_published_direct_keeps_legacy_start_without_explicit_pull(self):
        result = self.run_task("run-full-mas", NOA_MODE="published", NOA_ENFORCEMENT_MODE="direct")
        self.assertEqual(result.returncode, 0, result.stderr)
        commands = self.commands()
        self.assertFalse(any("pull" in command["args"] for command in commands))
        starts = [command for command in commands if "up" in command["args"]]
        self.assertEqual(len(starts), 1)
        self.assertEqual(starts[0]["args"][-6:],
                         ["--profile", "full-mas", "up", "--no-build", "--no-deps", "noa-trip-planner"])

    def test_infra_proxy_mode_bootstraps_before_mas_onboarding(self):
        result = self.run_task("infra-up", NOA_MODE="published",
                               NOA_ENFORCEMENT_MODE="proxy", NOA_MAS_ID="")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(any("noa_a2a.py" in " ".join(c["args"]) for c in self.commands()))
        self.assertFalse(any("enforcement-proxy" in " ".join(c["args"]) for c in self.commands()))

    def test_down_stops_owned_images_before_infrastructure(self):
        result = self.run_task("infra-down", MOCK_RUNNING="ioc-scale-cfn-svc")
        self.assertEqual(result.returncode, 0, result.stderr)
        stops = [command for command in self.commands() if "stop" in command["args"]]
        self.assertEqual(len(stops), 2)
        self.assertIn("ioc-scale-cfn-svc", stops[0]["args"])
        self.assertIn("ioc-scale-db", stops[1]["args"])

    def test_down_retires_native_mas_before_cf_even_after_switching_mode(self):
        directory = self.cfn / ".local/noa-a2a"
        directory.mkdir(parents=True)
        (directory / "installation.env").touch()
        result = self.run_task("infra-down", MOCK_RUNNING="ioc-scale-cfn-svc",
                               NOA_ENFORCEMENT_MODE="direct")
        self.assertEqual(result.returncode, 0, result.stderr)
        commands = self.commands()
        retire = next(i for i, c in enumerate(commands)
                      if c["tool"] == "uv" and c["args"][-1] == "down")
        stop = next(i for i, c in enumerate(commands) if "stop" in c["args"])
        self.assertLess(retire, stop)

    def test_docker_failures_propagate(self):
        for settings in ({"MOCK_PS_FAIL": "1"}, {"MOCK_UP_EXIT": "17"}):
            with self.subTest(settings=settings):
                result = self.run_task("run-cfn-mgmt-image", **settings)
                self.assertNotEqual(result.returncode, 0)

    def test_source_commands_run_from_components_and_use_root_workspace(self):
        for action, component in [
            ("run-cfn", "cfn"),
            ("run-cfn-mgmt", "cf-mgmt"),
            ("run-template-ce", "samples/template-ce"),
            ("run-full-mas", "samples/noa-trip-planner"),
            ("run-demo-ce", "samples/demo-ce"),
        ]:
            with self.subTest(action=action):
                self.log.unlink(missing_ok=True)
                result = self.run_task(action)
                self.assertEqual(result.returncode, 0, result.stderr)
                command = self.commands()[-1]
                self.assertEqual(command["cwd"], str(self.cfn / component))
                self.assertEqual(command["env"]["GOWORK"], str(self.cfn / "go.work"))
        go_commands = [x for x in self.commands() if x["tool"] == "go"]
        self.assertEqual([x["args"][0] for x in go_commands], ["build"])
        self.assertFalse(any("-modfile" in arg for x in go_commands for arg in x["args"]))

    def test_source_proxy_is_rejected_before_starting_services(self):
        result = self.run_task("run-full-mas", NOA_MODE="source", NOA_ENFORCEMENT_MODE="proxy")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("NOA_MODE=published", result.stderr)
        self.assertFalse(any("up" in c["args"] or "pull" in c["args"] for c in self.commands()))

    def test_all_eight_suites_are_in_aggregate_and_test_database_is_isolated(self):
        for action in ("test", "check"):
            with self.subTest(action=action):
                self.log.unlink(missing_ok=True)
                result = self.run_task(action)
                self.assertEqual(result.returncode, 0, result.stderr)
                commands = self.commands()
                expected = {
                    ("make", "api"), ("make", "cfn"), ("poetry", "cf-mgmt"),
                    ("npm", "cf-ui"), ("go", "samples/demo-ce"),
                    ("uv", "samples/template-ce"), ("uv", "samples/noa-trip-planner"),
                    ("task", "."),
                }
                covered = {(x["tool"], str(Path(x["cwd"]).relative_to(self.cfn)))
                           for x in commands if Path(x["cwd"]).is_relative_to(self.cfn)}
                self.assertTrue(expected <= covered, expected - covered)
                management = [x for x in commands if x["tool"] == "poetry" and "pytest" in x["args"]]
                self.assertEqual(management[0]["env"]["POSTGRES_DB"], "ioc_test")
                self.assertFalse(any("up" in x["args"] for x in commands))
                if action == "check":
                    self.assertTrue(any(
                        x["tool"] == "make" and x["cwd"] == str(self.cfn / "api")
                        and x["args"] == ["lint", "proto-check", "openapi-check"]
                        for x in commands
                    ))

    @unittest.skipUnless(shutil.which("task"), "Task CLI is not installed")
    def test_shell_tag_override_wins_over_task_dotenv(self):
        (self.cfn / ".env").write_text("CFN_SVC_TAG=from-dotenv\n")
        result = subprocess.run(
            [shutil.which("task"), "--dir", str(self.cfn), "run:cfn:image"],
            env=self.env | {"CFN_SVC_TAG": "123"}, capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.last_up()["env"]["CFN_SVC_TAG"], "123")


@unittest.skipUnless(shutil.which("docker"), "Docker Compose CLI is not installed")
class ImageComposeTests(unittest.TestCase):
    def test_bundled_deployment_uses_root_env_and_preserves_stack_identity(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "cognition-fabric"
            deployment = root / "deploy"
            deployment.mkdir(parents=True)
            shutil.copyfile(ROOT_DIR / "deploy/docker-compose.yml", deployment / "docker-compose.yml")
            shutil.copyfile(ROOT_DIR / ".env.example", root / ".env")
            # An unrelated deploy/.env must not supply the container environment.
            (deployment / ".env").write_text("DEPLOYMENT_ONLY=private\n")
            env = {key: os.environ[key] for key in ("PATH", "HOME", "DOCKER_CONFIG")
                   if key in os.environ}
            command = ["docker", "compose", "--env-file", str(root / ".env"),
                       "-f", str(deployment / "docker-compose.yml")]
            for flavor in (None, "envoy", "shadi", "local"):
                with self.subTest(flavor=flavor):
                    args = list(command)
                    if flavor == "local":
                        args += ["-f", str(ROOT_DIR / "dev/compose/infrastructure.override.yaml")]
                    elif flavor:
                        overlay = deployment / "enforcement" / flavor / "compose.yaml"
                        overlay.parent.mkdir(parents=True)
                        shutil.copyfile(ROOT_DIR / "deploy/enforcement" / flavor / "compose.yaml", overlay)
                        args += ["-f", str(overlay)]
                    result = subprocess.run(
                        args + ["config", "--format", "json"], capture_output=True, text=True,
                        env=env | {"CF_LOCAL_ENV_FILE": str(root / ".env")},
                    )
                    self.assertEqual(result.returncode, 0, result.stderr)
                    config = json.loads(result.stdout)
                    self.assertEqual(config["name"], "ioc-scale-cf-deployment")
                    self.assertEqual(config["networks"]["default"]["name"],
                                     "ioc-scale-cf-deployment_default")
                    self.assertEqual(config["volumes"]["ioc_scale_db_data"]["name"],
                                     "ioc-scale-cf-deployment_ioc_scale_db_data")
                    services = config["services"]
                    for name in ("ioc-scale-db", "ioc-scale-cf-mgmt-svc", "ioc-scale-cf-mgmt-plane-ui",
                                 "ioc-scale-cfn-svc", "ioc-scale-cf-demo-ce"):
                        self.assertTrue(services[name]["image"].startswith("ghcr.io/ioc-project/"))
                    self.assertEqual(services["ioc-scale-db"]["image"],
                                     "ghcr.io/ioc-project/ioc-scale-db:0.2.0")
                    for name in ("ioc-scale-enforcement-proxy-mediation",
                                 "ioc-scale-enforcement-proxy-sidecar-installer",
                                 "ioc-scale-enforcement-proxy-wasm-installer",
                                 "ioc-scale-enforcement-proxy-shadi-verifier"):
                        if name in services:
                            self.assertTrue(services[name]["image"].startswith("ghcr.io/cisco-eti/"))
                    self.assertEqual(services["oxp-api"]["environment"]["POSTGRES_PORT"], "5432")
                    self.assertEqual(services["ioc-scale-db"]["environment"]["POSTGRES_USER"],
                                     "postgresUser")
                    self.assertNotIn("DEPLOYMENT_ONLY", services["oxp-api"]["environment"])
                    self.assertNotIn("DEPLOYMENT_ONLY", services["norm"]["environment"])

    def test_cf_and_proxy_registry_fallbacks_and_overrides_are_independent(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            deployment = root / "deploy"
            deployment.mkdir()
            shutil.copyfile(ROOT_DIR / "deploy/docker-compose.yml", deployment / "docker-compose.yml")
            # Check Compose fallbacks without the corresponding template settings.
            template = (ROOT_DIR / ".env.example").read_text().splitlines()
            envfile = root / ".env"
            selectors = ("CF_REGISTRY=", "PROXY_REGISTRY=", "ENFORCEMENT_PROXY_MEDIATION_TAG=")
            envfile.write_text("\n".join(line for line in template if not line.startswith(selectors)))
            base_env = {key: os.environ[key] for key in ("PATH", "HOME", "DOCKER_CONFIG")
                        if key in os.environ}
            cases = (
                ({}, "ghcr.io/ioc-project", "ghcr.io/cisco-eti"),
                ({"CF_REGISTRY": "registry.example.invalid/cf"},
                 "registry.example.invalid/cf", "ghcr.io/cisco-eti"),
                ({"PROXY_REGISTRY": "registry.example.invalid/proxy"},
                 "ghcr.io/ioc-project", "registry.example.invalid/proxy"),
                ({"CF_REGISTRY": "registry.example.invalid/cf",
                  "PROXY_REGISTRY": "registry.example.invalid/proxy"},
                 "registry.example.invalid/cf", "registry.example.invalid/proxy"),
            )
            cf_images = {
                "ioc-scale-db": "ioc-scale-db:0.2.0",
                "ioc-scale-cf-mgmt-svc": "ioc-scale-cf-mgmt-svc:latest",
                "ioc-scale-cf-mgmt-plane-ui": "ioc-scale-cf-ui:latest",
                "ioc-scale-cfn-svc": "ioc-scale-cfn-svc:latest",
                "ioc-scale-cf-demo-ce": "ioc-scale-cf-demo-ce/demo-ce:latest",
            }
            for flavor in ("envoy", "shadi"):
                overlay = deployment / "enforcement" / flavor / "compose.yaml"
                overlay.parent.mkdir(parents=True)
                shutil.copyfile(ROOT_DIR / "deploy/enforcement" / flavor / "compose.yaml", overlay)
                for overrides, cf_registry, proxy_registry in cases:
                    with self.subTest(flavor=flavor, overrides=overrides):
                        result = subprocess.run(
                            ["docker", "compose", "--env-file", str(envfile),
                             "-f", str(deployment / "docker-compose.yml"), "-f", str(overlay),
                             "--profile", "full-mas", "config", "--format", "json"],
                            env=base_env | overrides, capture_output=True, text=True,
                        )
                        self.assertEqual(result.returncode, 0, result.stderr)
                        services = json.loads(result.stdout)["services"]
                        for name, suffix in cf_images.items():
                            self.assertEqual(services[name]["image"], f"{cf_registry}/{suffix}")
                        proxy_images = {
                            "ioc-scale-enforcement-proxy-mediation": "ioc-scaling-enforcement-mediation",
                        }
                        if flavor == "envoy":
                            proxy_images.update({
                                "ioc-scale-enforcement-proxy-sidecar-installer": "ioc-scaling-enforcement-proxy-sidecar",
                                "ioc-scale-enforcement-proxy-wasm-installer": "ioc-scaling-enforcement-proxy-wasm",
                            })
                        else:
                            proxy_images["ioc-scale-enforcement-proxy-shadi-verifier"] = "ioc-scaling-enforcement-proxy-shadi-verifier"
                        for name, repository in proxy_images.items():
                            self.assertEqual(services[name]["image"],
                                             f"{proxy_registry}/{repository}:latest")
                        self.assertTrue(services["oxp-api"]["image"].startswith(
                            "ghcr.io/cisco-eti/oxp/container-images/"))
                        self.assertTrue(services["noa-trip-planner"]["image"].startswith(
                            "ghcr.io/cisco-eti/claris/container-images/"))

    def test_infrastructure_reads_root_env_and_ignores_deployment_private_env(self):
        services = (
            "oxp-api", "norm", "embedding", "mce", "grouping", "analysis",
            "hierarchical-grouping", "decision-block", "stateful-eval", "noa-trip-planner",
        )
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            deployment = root / "deploy"
            deployment.mkdir()
            envfile = root / "root.env"
            envfile.write_text("ROOT_MARKER=from-monorepo\nIOC_SCALE_DB_PORT=5456\n")
            base = deployment / "compose.yaml"
            base.write_text("services:\n" + "".join(
                f"  {name}:\n    image: example.invalid/fixture\n"
                "    env_file: .env\n    environment:\n      BASE_VALUE: preserved\n"
                + ("      POSTGRES_PORT: ${IOC_SCALE_DB_PORT}\n" if name == "oxp-api" else "")
                for name in services
            ))
            env = {key: value for key, value in os.environ.items()
                   if not key.startswith(("CF_", "CFN_", "COMPOSE_"))}
            env["CF_LOCAL_ENV_FILE"] = str(envfile)
            command = [
                "docker", "compose", "--project-directory", str(deployment),
                "--env-file", str(envfile), "-f", str(base), "-f",
                str(ROOT_DIR / "dev/compose/infrastructure.override.yaml"),
                "config", "--format", "json",
            ]
            for private_env in (False, True):
                with self.subTest(deployment_env_exists=private_env):
                    if private_env:
                        (deployment / ".env").write_text("DEPLOYMENT_ONLY=private\nROOT_MARKER=wrong\n")
                    result = subprocess.run(command, env=env, capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    model = json.loads(result.stdout)
                    for name in services:
                        expected = {"ROOT_MARKER": "from-monorepo", "BASE_VALUE": "preserved",
                                    "IOC_SCALE_DB_PORT": "5456"}
                        if name == "oxp-api":
                            expected["POSTGRES_PORT"] = "5432"
                        self.assertEqual(model["services"][name]["environment"], expected)

    def test_sample_compose_build_uses_root_context_without_private_module_secret(self):
        result = subprocess.run(
            ["docker", "compose", "-f", str(ROOT_DIR / "samples/docker-compose.yml"),
             "config", "--format", "json"],
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        config = json.loads(result.stdout)
        build = config["services"]["demo-ce"]["build"]
        self.assertEqual(Path(build["context"]).resolve(), ROOT_DIR.resolve())
        self.assertEqual(build["dockerfile"], "samples/demo-ce/Dockerfile")
        self.assertNotIn("secrets", build)
        self.assertFalse(config.get("secrets"))

    def test_rendered_images_share_local_databases_without_starting_dependencies(self):
        # `compose config` is read-only and needs no running Docker daemon.
        with tempfile.TemporaryDirectory() as temporary:
            envfile = Path(temporary) / "compose.env"
            envfile.write_text(
                "ADMIN_USER_PASSWORD=test\nIOC_SCALE_DB_USER=test\n"
                "IOC_SCALE_DB_PASSWORD=test\nNEXTAUTH_SECRET=test\n"
                "CF_MGMT_SVC_TAG=mgmt-test\nCFN_SVC_TAG=cfn-test\n"
                "CF_UI_TAG=ui-test\nCF_DEMO_CE_TAG=ce-test\n"
            )
            env = {key: value for key, value in os.environ.items()
                   if not key.startswith(("CF_", "CFN_", "COMPOSE_"))}
            env.update(CF_LOCAL_CE_CONFIG_FILE=str(Path(temporary) / "policy.json"),
                       CF_LOCAL_CE_MAS_FILE=str(Path(temporary) / "mas-id"))
            result = subprocess.run(
                ["docker", "compose", "--env-file", str(envfile), "-f",
                 str(ROOT_DIR / "dev/compose/images.yaml"),
                 "config", "--format", "json"],
                env=env, capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            config = json.loads(result.stdout)
            services = config["services"]
            self.assertEqual(len(services), 4)
            for name, tag in [
                ("ioc-scale-cf-mgmt-svc", "mgmt-test"),
                ("ioc-scale-cfn-svc", "cfn-test"),
                ("ioc-scale-cf-mgmt-plane-ui", "ui-test"),
                ("ioc-scale-cf-demo-ce", "ce-test"),
            ]:
                service = services[name]
                self.assertTrue(service["image"].endswith(":" + tag))
                self.assertTrue(service["image"].startswith("ghcr.io/ioc-project/"))
                self.assertEqual(service["labels"]["io.cisco.cf.local"], "true")
                self.assertNotIn("depends_on", service)
                self.assertNotIn("build", service)
            self.assertEqual(services["ioc-scale-cf-mgmt-svc"]["environment"]["POSTGRES_DB"],
                             "cfn_mgmt_local")
            self.assertEqual(services["ioc-scale-cfn-svc"]["environment"]["POSTGRES_AUDIT_DB"],
                             "cfn_audit_local")
            self.assertTrue(config["networks"]["default"]["external"])
            env["LOCAL_CF_MGMT_DB"] = "cfn_mgmt_image"
            env["CF_REGISTRY"] = "registry.example.invalid/cf"
            result = subprocess.run(result.args, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(
                json.loads(result.stdout)["services"]["ioc-scale-cf-mgmt-svc"]["environment"]["POSTGRES_DB"],
                "cfn_mgmt_image",
            )
            self.assertTrue(all(service["image"].startswith("registry.example.invalid/cf/")
                                for service in json.loads(result.stdout)["services"].values()))


if __name__ == "__main__":
    unittest.main()

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
        if ".Mounts" in args[2]:
            print(os.environ.get("MOCK_PROXY_MOUNT", os.environ["MOCK_CFN"] + "/.local/enforcement/envoy.json"))
        else:
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
        for helper in ("check_ports.py", "check_mgmt_migrations.py"):
            (self.runner.parent / "tools").mkdir(exist_ok=True)
            shutil.copyfile(RUNNER.parent / "tools" / helper, self.runner.parent / "tools" / helper)
        shutil.copyfile(ROOT_DIR / "Taskfile.yml", self.cfn / "Taskfile.yml")
        (self.cfn / ".env").touch()
        (self.cfn / "go.work").touch()
        deployment = workspace / "ioc-scale-cf-deployment"
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
            MOCK_CFN=str(self.cfn),
            MOCK_RUNNING="ioc-scale-db,otel-collector",
            IOC_SCALE_DB_USER="test",
            IOC_SCALE_DB_PASSWORD="test",
            ADMIN_USER_PASSWORD="test",
            NEXTAUTH_SECRET="test",
            CF_DEPLOYMENT_DIR="../ioc-scale-cf-deployment",
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
        return [json.loads(line) for line in self.log.read_text().splitlines()]

    def last_up(self):
        return next(command for command in reversed(self.commands())
                    if command["tool"] == "docker" and "up" in command["args"])

    def test_deployment_path_accepts_absolute_and_root_relative_paths_with_spaces(self):
        deployment = self.cfn.parent / "external infrastructure" / "shared checkout"
        deployment.parent.mkdir()
        (self.cfn.parent / "ioc-scale-cf-deployment").rename(deployment)
        for value in (str(deployment), "../external infrastructure/shared checkout"):
            with self.subTest(path=value):
                self.log.unlink(missing_ok=True)
                result = self.run_task("infra-up", CF_DEPLOYMENT_DIR=value)
                self.assertEqual(result.returncode, 0, result.stderr)
                commands = [x for x in self.commands() if "--project-directory" in x["args"]]
                self.assertTrue(commands)
                for command in commands:
                    args = command["args"]
                    self.assertEqual(args[args.index("--project-directory") + 1], str(deployment))
                    self.assertIn(str(deployment / "docker-compose.yml"), args)
                    self.assertEqual(command["cwd"], str(deployment))

    def test_missing_or_invalid_deployment_setting_fails_before_docker(self):
        for value in ("", "../missing-deployment-checkout"):
            with self.subTest(path=value):
                result = self.run_task("infra-up", CF_DEPLOYMENT_DIR=value)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("CF_DEPLOYMENT_DIR", result.stderr)
                self.assertFalse(self.log.exists())

    @unittest.skipUnless(shutil.which("task"), "Task CLI is not installed")
    def test_task_loads_deployment_path_from_root_dotenv(self):
        deployment = self.cfn.parent / "custom infrastructure"
        (self.cfn.parent / "ioc-scale-cf-deployment").rename(deployment)
        (self.cfn / ".env").write_text('CF_DEPLOYMENT_DIR="../custom infrastructure"\n')
        env = dict(self.env)
        del env["CF_DEPLOYMENT_DIR"]
        result = subprocess.run(
            [shutil.which("task"), "--dir", str(self.cfn), "infra:up"],
            env=env, capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        command = self.last_up()
        args = command["args"]
        self.assertEqual(args[args.index("--project-directory") + 1], str(deployment))

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

    def test_rejects_unowned_deployment_before_shutdown(self):
        result = self.run_task("infra-down", MOCK_RUNNING="ioc-scale-cfn-svc",
                               MOCK_UNOWNED="ioc-scale-cfn-svc")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("published deployment", result.stderr)
        self.assertFalse(any("stop" in command["args"] for command in self.commands()))

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

    def test_source_noa_proxy_accepts_local_cfn_image(self):
        result = self.run_task(
            "run-full-mas", NOA_MODE="source", NOA_ENFORCEMENT_MODE="proxy",
            MOCK_RUNNING="ioc-scale-cfn-svc,otel-collector,ioc-scale-enforcement-proxy-envoy",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.last_up()["args"][-1], "ioc-scale-enforcement-proxy-envoy")
        self.assertEqual(self.commands()[-1]["tool"], "uv")
        self.assertIn("noa_trip_planner.proxy_runtime", self.commands()[-1]["args"])

    def test_down_stops_owned_images_before_infrastructure(self):
        result = self.run_task("infra-down", MOCK_RUNNING="ioc-scale-cfn-svc")
        self.assertEqual(result.returncode, 0, result.stderr)
        stops = [command for command in self.commands() if "stop" in command["args"]]
        self.assertEqual(len(stops), 2)
        self.assertIn("ioc-scale-cfn-svc", stops[0]["args"])
        self.assertIn("ioc-scale-db", stops[1]["args"])

    def test_down_stops_local_proxy_even_after_switching_to_direct_mode(self):
        directory = self.cfn / ".local/enforcement"
        directory.mkdir(parents=True)
        (directory / "state.json").write_text("{}")
        result = self.run_task("infra-down", MOCK_RUNNING="ioc-scale-cfn-svc",
                               NOA_ENFORCEMENT_MODE="direct")
        self.assertEqual(result.returncode, 0, result.stderr)
        stops = [command for command in self.commands() if "stop" in command["args"]]
        self.assertEqual(len(stops), 3)
        self.assertIn("ioc-scale-cfn-svc", stops[0]["args"])
        self.assertIn("ioc-scale-enforcement-proxy-envoy", stops[1]["args"])
        self.assertIn("ioc-scale-db", stops[2]["args"])

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

    def test_new_checkout_rejects_existing_proxy_mount_before_reconfiguration(self):
        result = self.run_task(
            "run-full-mas", NOA_ENFORCEMENT_MODE="proxy",
            MOCK_PROXY_MOUNT="/old-checkout/.local/enforcement/envoy.json",
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("another workflow", result.stderr)
        self.assertFalse(any("up" in x["args"] or "stop" in x["args"] for x in self.commands()))

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
    def test_infrastructure_reads_root_env_and_ignores_deployment_private_env(self):
        services = (
            "oxp-api", "norm", "embedding", "mce", "grouping", "analysis",
            "hierarchical-grouping", "decision-block", "stateful-eval", "noa-trip-planner",
        )
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            deployment = root / "ioc-scale-cf-deployment"
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
                self.assertEqual(service["labels"]["io.cisco.cf.local"], "true")
                self.assertNotIn("depends_on", service)
                self.assertNotIn("build", service)
            self.assertEqual(services["ioc-scale-cf-mgmt-svc"]["environment"]["POSTGRES_DB"],
                             "cfn_mgmt_local")
            self.assertEqual(services["ioc-scale-cfn-svc"]["environment"]["POSTGRES_AUDIT_DB"],
                             "cfn_audit_local")
            self.assertTrue(config["networks"]["default"]["external"])
            env["LOCAL_CF_MGMT_DB"] = "cfn_mgmt_image"
            result = subprocess.run(result.args, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(
                json.loads(result.stdout)["services"]["ioc-scale-cf-mgmt-svc"]["environment"]["POSTGRES_DB"],
                "cfn_mgmt_image",
            )


if __name__ == "__main__":
    unittest.main()

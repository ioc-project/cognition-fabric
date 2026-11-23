# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Deployment lifecycle contracts, with real Compose rendering and no containers."""

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
DOCKER = shutil.which("docker")
SERVICE = "ioc-scale-enforcement-proxy-envoy"
SIDECAR = "ioc-scale-enforcement-proxy-sidecar-installer"
WASM = "ioc-scale-enforcement-proxy-wasm-installer"
SHADI = "ioc-scale-enforcement-proxy-shadi-verifier"
MEDIATION = "ioc-scale-enforcement-proxy-mediation"
IMAGE_SETTINGS = {
    MEDIATION: ("ENFORCEMENT_PROXY_MEDIATION", "ioc-scaling-enforcement-mediation"),
    SIDECAR: ("ENFORCEMENT_SIDECAR", "ioc-scaling-enforcement-proxy-sidecar"),
    WASM: ("ENFORCEMENT_WASM", "ioc-scaling-enforcement-proxy-wasm"),
    SHADI: ("ENFORCEMENT_SHADI", "ioc-scaling-enforcement-proxy-shadi-verifier"),
}
spec = importlib.util.spec_from_file_location(
    "prepare_envoy", ROOT / "deploy/scripts/prepare-envoy.py"
)
preparer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preparer)


class PreparationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.spec = self.root / "spec.yaml"
        self.template = self.root / "template.yaml"
        self.generated = self.root / "generated"
        self.activation = self.root / "owned activation"
        self.activation.mkdir()
        self.spec.write_bytes(b"operator spec\r\n")
        self.template.write_bytes(b"digest: __SIDECAR_SPEC_SHA256__\n")
        self.config = {
            "services": {
                SERVICE: {
                    "volumes": [
                        {"type": "bind", "source": str(source), "target": target}
                        for source, target in (
                            (self.spec, "/etc/sidecar/sidecar-spec.yaml"),
                            (self.template, "/etc/envoy-template/envoy.yaml"),
                            (self.generated, "/etc/envoy"),
                            (self.activation, "/etc/sidecar/activation"),
                        )
                    ]
                }
            }
        }

    def test_digest_binds_raw_bytes_and_preparation_preserves_owner_state(self):
        lease = self.activation / "control.json"
        lease.write_text("owner-managed, do not modify")
        original = lease.read_bytes()
        first = preparer.prepare(self.config)
        output = self.generated / "envoy.yaml"
        self.assertEqual(
            output.read_text(),
            "digest: " + hashlib.sha256(self.spec.read_bytes()).hexdigest() + "\n",
        )
        inode = output.stat().st_ino
        self.assertEqual(preparer.prepare(self.config), first)
        self.assertEqual(output.stat().st_ino, inode)
        self.spec.write_bytes(b"updated spec\n")
        self.assertNotEqual(preparer.prepare(self.config), first)
        self.assertEqual(lease.read_bytes(), original)
        self.assertEqual(self.spec.read_bytes(), b"updated spec\n")

    def test_missing_input_marker_or_owner_directory_does_not_replace_output(self):
        preparer.prepare(self.config)
        output = self.generated / "envoy.yaml"
        original = output.read_bytes()
        self.template.write_text("no digest marker")
        with self.assertRaisesRegex(ValueError, "digest marker"):
            preparer.prepare(self.config)
        self.assertEqual(output.read_bytes(), original)
        self.template.write_bytes(preparer.MARKER)
        self.activation.rmdir()
        with self.assertRaisesRegex(ValueError, "directory must exist"):
            preparer.prepare(self.config)
        self.assertFalse(self.activation.exists())
        self.spec.unlink()
        with self.assertRaises(FileNotFoundError):
            preparer.prepare(self.config)

    def test_output_cannot_replace_an_operator_input(self):
        self.spec = self.generated / "envoy.yaml"
        self.generated.mkdir()
        self.spec.write_bytes(b"original")
        self.config["services"][SERVICE]["volumes"][0]["source"] = str(self.spec)
        with self.assertRaisesRegex(ValueError, "separate"):
            preparer.prepare(self.config)
        self.assertEqual(self.spec.read_bytes(), b"original")


FAKE_DOCKER = r"""#!/usr/bin/env python3
# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0
import json, os, subprocess, sys
args = sys.argv[1:]
with open(os.environ["MOCK_LOG"], "a") as f:
    f.write(json.dumps(args) + "\n")
if args == ["info"]:
    sys.exit(0)
if "config" in args:
    os.execv(os.environ["REAL_DOCKER"], [os.environ["REAL_DOCKER"], *args])
if "ps" in args:
    if "--services" in args:
        print(os.environ.get("OTHER_FLAVOR_SERVICE", ""))
    elif "--format" in args:
        command = [os.environ["REAL_DOCKER"], *args[:args.index("ps")], "config", "--services"]
        names = subprocess.check_output(command, text=True).splitlines()
        print(json.dumps([{"Service": n, "State": "running", "Health": "healthy"} for n in names]))
"""


@unittest.skipUnless(DOCKER, "Docker Compose CLI is not installed")
class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "checkout with spaces"
        self.deploy = self.root / "deploy"
        files = (
            "docker-compose.yml",
            "Makefile",
            "scripts/run-stack.sh",
            "scripts/prepare-envoy.py",
            "demo-ce/config/config.json",
            "enforcement/envoy/compose.yaml",
            "enforcement/envoy/envoy.yaml",
            "enforcement/envoy/sidecar-spec.example.yaml",
            "enforcement/envoy/upstream-nginx.conf",
            "enforcement/shadi/compose.yaml",
            "enforcement/shadi/config.example.json",
        )
        for name in files:
            destination = self.deploy / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / "deploy" / name, destination)
        shutil.copyfile(ROOT / ".env.example", self.root / ".env")
        self.env = {
            key: os.environ[key]
            for key in ("PATH", "HOME", "DOCKER_CONFIG")
            if key in os.environ
        }
        self.env.update(REAL_DOCKER=DOCKER, MOCK_LOG=str(self.root / "calls.jsonl"))
        self.bin = self.root / "bin"
        self.bin.mkdir()
        fake = self.bin / "docker"
        fake.write_text(
            FAKE_DOCKER.replace("#!/usr/bin/env python3", "#!" + sys.executable, 1)
        )
        fake.chmod(0o755)
        self.env["PATH"] = str(self.bin) + os.pathsep + self.env["PATH"]

    def append_env(self, text):
        with (self.root / ".env").open("a") as f:
            f.write("\n" + text + "\n")

    def run_make(self, action, flavor=None, profile=None, extra=None):
        command = ["make", "-C", str(self.deploy), action]
        if flavor:
            command += ["enforcement=" + flavor]
        if profile:
            command += ["profile=" + profile]
        return subprocess.run(
            command, env=self.env | (extra or {}), text=True, capture_output=True
        )

    def config(self, flavors=(), profile=None, extra=None):
        args = [
            DOCKER,
            "compose",
            "--project-directory",
            str(self.deploy),
            "--env-file",
            str(self.root / ".env"),
            "-f",
            str(self.deploy / "docker-compose.yml"),
        ]
        for flavor in flavors:
            args += ["-f", str(self.deploy / "enforcement" / flavor / "compose.yaml")]
        if profile:
            args += ["--profile", profile]
        result = subprocess.run(
            args + ["config", "--format", "json"],
            env=self.env | (extra or {}),
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def calls(self):
        return [
            json.loads(line)
            for line in Path(self.env["MOCK_LOG"]).read_text().splitlines()
        ]

    def envoy_spec(self, name="enforcement/envoy/sidecar-spec.yaml"):
        path = self.deploy / name
        path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(
            self.deploy / "enforcement/envoy/sidecar-spec.example.yaml", path
        )
        return path

    def shadi_config(self, name="enforcement/shadi/config"):
        directory = self.deploy / name
        directory.mkdir(parents=True)
        shutil.copyfile(
            self.deploy / "enforcement/shadi/config.example.json",
            directory / "config.json",
        )
        for f in ("ca.crt", "server.crt", "server.key"):
            (directory / f).write_text("test fixture; not a real credential")
        return directory

    def test_flavor_profile_matrix_preserves_platform_identity(self):
        base = self.config()
        for flavors in ((), ("envoy",), ("shadi",), ("envoy", "shadi")):
            for profile in (None, "full-mas"):
                with self.subTest(flavors=flavors, profile=profile):
                    config = self.config(flavors, profile)
                    self.assertEqual(config["name"], "ioc-scale-cf-deployment")
                    self.assertEqual(config["networks"], base["networks"])
                    self.assertEqual(
                        config["volumes"]["ioc_scale_db_data"],
                        base["volumes"]["ioc_scale_db_data"],
                    )
                    for name, service in config["services"].items():
                        self.assertNotIn("build", service)
                        if name in base["services"] and name != MEDIATION:
                            self.assertEqual(service, base["services"][name])
                    self.assertEqual(
                        "noa-trip-planner" in config["services"], profile == "full-mas"
                    )
                    if profile:
                        self.assertIn(
                            "/noa-trip-planner:latest",
                            config["services"]["noa-trip-planner"]["image"],
                        )

    def test_latest_defaults_and_explicit_image_override_precedence(self):
        for name, (prefix, package) in IMAGE_SETTINGS.items():
            with self.subTest(service=name):
                settings = self.config(("envoy", "shadi"))["services"]
                self.assertEqual(
                    settings[name]["image"], "ghcr.io/cisco-eti/" + package + ":latest"
                )
                tagged = self.config(
                    ("envoy", "shadi"),
                    extra={
                        "CF_REGISTRY": "example.invalid/team",
                        prefix + "_TAG": "known",
                    },
                )
                self.assertEqual(
                    tagged["services"][name]["image"],
                    "example.invalid/team/" + package + ":known",
                )
                pinned = "example.invalid/rollback@sha256:" + "a" * 64
                selected = self.config(
                    ("envoy", "shadi"),
                    extra={prefix + "_IMAGE": pinned, prefix + "_TAG": "ignored"},
                )
                self.assertEqual(selected["services"][name]["image"], pinned)

    def test_adapters_use_direct_audit_and_installer_updates_restart_envoy(self):
        services = self.config(("envoy", "shadi"))["services"]
        for name in (SERVICE, SHADI):
            environment = services[name]["environment"]
            self.assertEqual(environment["AUDIT_QUEUE_CAPACITY"], "256")
            self.assertEqual(environment["AUDIT_RPC_TIMEOUT"], "2s")
            self.assertFalse(
                any(key.startswith("AUDIT_JOURNAL_") for key in environment)
            )
            self.assertNotIn(MEDIATION, services[name].get("depends_on", {}))
        for name in (SIDECAR, WASM):
            self.assertEqual(
                services[SERVICE]["depends_on"][name]["condition"],
                "service_completed_successfully",
            )
            self.assertTrue(services[SERVICE]["depends_on"][name]["restart"])
        self.assertEqual(
            services[MEDIATION]["environment"]["AUDIT_PERSISTENCE_MODE"],
            "AUDIT_PERSISTENCE_MODE_CFN",
        )

    def test_doctor_prepares_quoted_dotenv_paths_and_shell_overrides_them(self):
        dotenv_spec = self.envoy_spec("private inputs/dotenv spec.yaml")
        template = self.deploy / "private inputs/template.yaml"
        template.write_text(
            (self.deploy / "enforcement/envoy/envoy.yaml").read_text()
            + "\n# private template\n"
        )
        activation = self.deploy / "private inputs/control"
        activation.mkdir()
        self.append_env(
            'SIDECAR_SPEC="./private inputs/dotenv spec.yaml"\n'
            'ENVOY_BOOTSTRAP_TEMPLATE="./private inputs/template.yaml"\n'
            'ENVOY_ACTIVATION_DIR="./private inputs/control"'
        )
        result = self.run_make("doctor", "envoy")
        self.assertEqual(result.returncode, 0, result.stderr)
        output = self.root / ".local/deploy-envoy/generated/envoy.yaml"
        self.assertIn(
            hashlib.sha256(dotenv_spec.read_bytes()).hexdigest(), output.read_text()
        )
        self.assertIn("private template", output.read_text())
        shell_spec = self.envoy_spec("shell spec.yaml")
        shell_spec.write_text(shell_spec.read_text() + "\n# shell override\n")
        result = self.run_make("up", "envoy", extra={"SIDECAR_SPEC": str(shell_spec)})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(
            hashlib.sha256(shell_spec.read_bytes()).hexdigest(), output.read_text()
        )
        self.assertEqual(list(activation.iterdir()), [])
        self.assertIn("unprovisioned", result.stdout)
        self.assertFalse(any("run" in call for call in self.calls()))

    def test_startup_failure_does_not_start_containers(self):
        result = self.run_make("up", "envoy")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Envoy preparation", result.stderr)
        self.assertFalse(any("up" in call for call in self.calls()))
        self.assertFalse((self.root / ".local/deploy-envoy").exists())

    def test_base_and_shadi_do_not_render_envoy(self):
        self.shadi_config("private shadi")
        self.append_env('SHADI_VERIFIER_CONFIG_DIR="./private shadi"')
        for flavor in (None, "shadi"):
            result = self.run_make("doctor", flavor)
            self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.root / ".local/deploy-envoy").exists())
        config = self.deploy / "private shadi/config.json"
        data = json.loads(config.read_text())
        self.assertEqual(data["activation"]["epoch"], "unprovisioned")
        self.assertEqual(data["activation"]["generation"], "unprovisioned")
        self.assertTrue(data["activation"]["path"].startswith("/"))
        del data["activation"]
        config.write_text(json.dumps(data))
        result = self.run_make("up", "shadi")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("activation reference", result.stderr)
        self.assertFalse(any("up" in call for call in self.calls()))

    def test_inspection_pull_and_teardown_work_without_private_inputs(self):
        for action in ("config", "pull", "status", "logs", "down"):
            result = self.run_make(action, "envoy")
            self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls()
        for action in ("status", "logs", "down"):
            command = "ps" if action == "status" else action
            selected = next(c for c in calls if command in c)
            self.assertTrue(any("/envoy/compose.yaml" in a for a in selected))
            self.assertTrue(any("/shadi/compose.yaml" in a for a in selected))
            self.assertIn("*", selected)
        self.assertFalse((self.root / ".local/deploy-envoy").exists())

    def test_refuses_other_flavor_before_starting(self):
        self.envoy_spec()
        result = self.run_make("up", "envoy", extra={"OTHER_FLAVOR_SERVICE": SHADI})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("run 'make down'", result.stderr)
        self.assertFalse(any("up" in call for call in self.calls()))


if __name__ == "__main__":
    unittest.main()

# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Check local runtime selection and failure boundaries without containers."""

import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import urllib.error


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("noa_a2a", ROOT / "dev/tools/noa_a2a.py")
NOA = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(NOA)
MAS = "00000000-0000-4000-8000-000000000001"
MCP = "00000000-0000-4000-8000-000000000002"


class NativeNoaTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.state = self.root / ".local/noa-a2a"
        self.source = self.root / "upstream"
        parser = self.source / NOA.RUNTIME_FILES[0]
        parser.parent.mkdir(parents=True)
        parser.write_text(
            "import json\n"
            "def load(paths):\n"
            " result={}\n"
            " for path in paths:\n"
            "  for line in path.read_text().splitlines():\n"
            "   key,value=line.split('=',1);result[key]=json.loads(value)\n"
            " return result\n"
        )
        self.settings = {
            "AI_GATEWAY_BASE_URL": "https://model.example.invalid/v1",
            "AI_GATEWAY_API_KEY": "fixture-$()-with-quotes-'",
            "NOA_LLM_MODEL": "provider/model",
            "NOA_MAS_ID": MAS, "NOA_MCP_SERVER_ID": MCP,
        }

    def values(self, **changes):
        return NOA.installation(self.settings | changes, self.state, self.source, self.root)

    def test_model_is_required_and_forwarded_unchanged(self):
        with self.assertRaisesRegex(ValueError, "Set NOA_LLM_MODEL"):
            self.values(NOA_LLM_MODEL="")
        self.assertEqual(self.values()["NOA_LLM_MODEL"], self.settings["NOA_LLM_MODEL"])

    def test_image_defaults_and_explicit_reference_precedence(self):
        values = self.values()
        expected = {"SIDECAR_IMAGE": "ioc-sidecar", "TRACEPARENT_WASM_IMAGE": "ioc-wasm",
                    "OPERATOR_DOCKER_IMAGE": "ioc-operator-docker", "MCP_GUARD_IMAGE": "ioc-mcp-ingress-guard"}
        for key, repository in expected.items():
            self.assertEqual(values[key], f"ghcr.io/ioc-project/{repository}:latest")
        self.assertEqual(values["NOA_A2A_IMAGE"], "local/ioc-scale-cf-deployment-noa-a2a:dev")
        values = self.values(
            PROXY_REGISTRY="registry.example.invalid/proxy/",
            NOA_PROXY_SIDECAR_TAG="older",
            NOA_PROXY_WASM_TAG="overridden-by-full-reference",
            TRACEPARENT_WASM_IMAGE="custom/wasm@sha256:" + "a" * 64,
        )
        self.assertEqual(values["SIDECAR_IMAGE"],
                         "registry.example.invalid/proxy/ioc-sidecar:older")
        self.assertEqual(values["TRACEPARENT_WASM_IMAGE"], "custom/wasm@sha256:" + "a" * 64)
        self.assertEqual(values["RUNTIME_IMAGES"], "local")
        self.assertEqual(values["RUNTIME_STATE_DIRECTORY"], str(self.state / ".ioc-runtime"))
        self.assertEqual(json.loads(values["RUNTIME_ENVOY_TRUSTED_INGRESS_PEERS"]),
                         {"noa-moderator": ["api"]})
        self.assertEqual(values["CF_ENFORCEMENT_ADDRESS"], "host.docker.internal:9003")

    def test_cf_registry_does_not_select_proxy_images(self):
        values = self.values(CF_REGISTRY="registry.example.invalid/cf")
        self.assertEqual(values["SIDECAR_IMAGE"], "ghcr.io/ioc-project/ioc-sidecar:latest")
        values = self.values(CF_REGISTRY="registry.example.invalid/cf",
                             PROXY_REGISTRY="registry.example.invalid/proxy")
        for key, _, repository in NOA.IMAGE_SELECTORS:
            self.assertEqual(values[key], f"registry.example.invalid/proxy/{repository}:latest")

    def test_noa_proxy_tags_select_each_component(self):
        values = self.values(NOA_PROXY_WASM_TAG="wasm-version",
                             NOA_PROXY_OPERATOR_TAG="operator-version",
                             NOA_PROXY_MCP_GUARD_TAG="guard-version")
        self.assertTrue(values["TRACEPARENT_WASM_IMAGE"].endswith(":wasm-version"))
        self.assertTrue(values["OPERATOR_DOCKER_IMAGE"].endswith(":operator-version"))
        self.assertTrue(values["MCP_GUARD_IMAGE"].endswith(":guard-version"))

    def test_identity_uses_canonical_mcp_and_provided_agent_ids(self):
        values = self.values()
        document = NOA.identity(self.settings, values["COMPOSE_PROJECT_NAME"], self.root)
        self.assertEqual(document["mas_id"], MAS)
        self.assertEqual(document["workloads"][-1]["mcp_server_id"], MCP)
        self.assertTrue(all(values["COMPOSE_PROJECT_NAME"] in w["workload_ref"]
                            for w in document["workloads"]))
        declaration = json.loads((ROOT / "samples/noa-trip-planner-a2a/mas/noa-a2a-mas.json").read_text())
        self.assertEqual({a["agent_id"] for a in declaration["agents"]},
                         set(NOA.AGENTS) | {"noa-llm"})
        self.assertEqual(len(declaration["mcp_servers"]), 1)
        with self.assertRaisesRegex(ValueError, "MCP server ID"):
            NOA.identity(self.settings | {"NOA_MCP_SERVER_ID": ""}, "example", self.root)

    def test_a2a_topology_references_declared_agents_and_mcp_tools(self):
        directory = ROOT / "samples/noa-trip-planner-a2a/mas"
        declaration = json.loads((directory / "noa-a2a-mas.json").read_text())
        self.assertEqual(len(declaration["topologies"]), 1)
        graph = declaration["topologies"][0]
        self.assertEqual((graph["source"], graph["completeness"]), ("provided", "partial"))
        agents = {a["agent_id"] for a in declaration["agents"]} - {"noa-llm"}
        nodes = {node["id"]: node for node in graph["nodes"]}
        self.assertEqual(len(nodes), len(graph["nodes"]))
        self.assertEqual({key for key, node in nodes.items() if node["type"] == "agent"}, agents)
        self.assertEqual(nodes["__start__"]["type"], "start")
        self.assertEqual(nodes["__end__"]["type"], "end")
        tool_ids = {tool["tool_id"] for tool in declaration["tools"]}
        self.assertEqual(len(tool_ids), len(declaration["tools"]))
        for node in nodes.values():
            self.assertTrue(set(node.get("tool_ids", [])) <= tool_ids)
        assignments = {key: set(node["tool_ids"]) for key, node in nodes.items()
                       if node["type"] == "agent"}
        self.assertEqual(assignments, {
            "noa-moderator": set(),
            "noa-schedule-agent": {"list_schedule_documents", "read_schedule_document"},
            "noa-itinerary-agent": {"query_graph_database", "calculate"},
            "noa-concierge-agent": {"list_concierge_documents", "read_concierge_document", "calculate"},
        })
        native = {(server["name"], tool["name"])
                  for server in declaration["mcp_servers"] for tool in server["tools"]}
        providers = set()
        for tool in declaration["tools"]:
            provider = tool["provider"]
            binding = (provider["mcp_server_name"], provider["native_tool_name"])
            self.assertIn(binding, native)
            self.assertEqual(tool["tool_id"], provider["native_tool_name"])
            providers.add(binding)
        self.assertEqual(providers, native)
        self.assertEqual(len(declaration["tools"]), len(native))

        edges = {(edge["source"], edge["target"]) for edge in graph["edges"]}
        self.assertEqual(edges, {
            ("__start__", "noa-moderator"), ("noa-moderator", "__end__"),
            *(("noa-moderator", agent) for agent in agents - {"noa-moderator"}),
            *((agent, "noa-moderator") for agent in agents - {"noa-moderator"}),
        })


    def test_custom_identity_cannot_silently_select_another_mas(self):
        path = self.root / "custom.json"
        path.write_text(json.dumps({"mas_id": "another-mas"}))
        with self.assertRaisesRegex(ValueError, "different MAS"):
            NOA.identity(self.settings | {"NOA_IDENTITY_FILE": "custom.json"}, "example", self.root)
        path.write_text("[]")
        with self.assertRaisesRegex(ValueError, "canonical identity object"):
            NOA.identity(self.settings | {"NOA_IDENTITY_FILE": "custom.json"}, "example", self.root)

    def test_ownership_refuses_foreign_or_running_project(self):
        directory = self.root / "dev/compose"
        for row, expected in [
            ({"directory": "/another/checkout", "running": False}, "another checkout"),
            ({"directory": str(directory), "running": True}, "already running"),
        ]:
            with self.subTest(row=row), patch.object(
                NOA.subprocess, "check_output", side_effect=["id\n", json.dumps(row) + "\n"],
            ), self.assertRaisesRegex(ValueError, expected):
                NOA.ownership("project", directory, stopped=True)

    def execute(self, callback):
        with patch.object(NOA, "runtime_source", return_value=self.source), \
             patch.object(NOA, "ownership"), \
             patch.object(NOA, "wait_api"), \
             patch.object(NOA.subprocess, "check_output", return_value='{"deployments":[]}'), \
             patch.object(NOA, "run", side_effect=callback):
            NOA.execute("up", self.settings, self.root)

    def test_pull_failure_preserves_authoritative_inputs_and_starts_nothing(self):
        self.state.mkdir(parents=True)
        (self.state / "installation.env").write_text("previous installation\n")
        (self.state / "identities.json").write_text("previous identities\n")
        commands = []

        def fail_pull(command, **_):
            commands.append(command)
            if command[:2] == ["docker", "pull"]:
                raise subprocess.CalledProcessError(17, command)

        with self.assertRaises(subprocess.CalledProcessError):
            self.execute(fail_pull)
        self.assertEqual((self.state / "installation.env").read_text(), "previous installation\n")
        self.assertEqual((self.state / "identities.json").read_text(), "previous identities\n")
        self.assertFalse((self.state / "installation-candidate.env").exists())
        self.assertFalse(any("up" in command or "down" in command for command in commands))

    def test_already_enrolled_runtime_is_rejected_before_writes_or_pulls(self):
        self.state.mkdir(parents=True)
        path = self.state / "installation.env"
        path.write_text("previous\n")
        with patch.object(NOA, "runtime_source", return_value=self.source), \
             patch.object(NOA.subprocess, "check_output",
                          return_value='{"deployments":[{"active":false}]}'), \
             patch.object(NOA, "run") as run, \
             self.assertRaisesRegex(ValueError, "still enrolled"):
            NOA.execute("up", self.settings, self.root)
        run.assert_not_called()
        self.assertEqual(path.read_text(), "previous\n")

    def test_all_pulls_precede_helpers_and_controller_reuses_full_references(self):
        commands = []

        def record(command, **options):
            commands.append((command, options))

        self.execute(record)
        pull_indices = [i for i, (c, _) in enumerate(commands) if c[:2] == ["docker", "pull"]]
        starts = [i for i, (c, _) in enumerate(commands) if "up" in c]
        self.assertEqual(len(pull_indices), 7)
        builds = [(i, c) for i, (c, _) in enumerate(commands) if c[:2] == ["docker", "build"]]
        self.assertEqual(len(builds), 1)
        build_index, build = builds[0]
        self.assertEqual(build[-1], str(self.root / NOA.NOA_SAMPLE))
        self.assertLess(build_index, min(starts))
        self.assertLess(max(pull_indices), min(starts))
        helper = next(c for c, _ in commands if "up" in c and c[0] == "docker")
        self.assertIn("--pull", helper)
        self.assertEqual(helper[helper.index("--pull") + 1], "never")
        content = (self.state / "installation.env").read_text()
        values = {k: json.loads(v) for k, v in (line.split("=", 1) for line in content.splitlines())}
        self.assertEqual(values["RUNTIME_IMAGES"], "local")
        self.assertTrue(all(values[k].startswith("ghcr.io/") for k, _, _ in NOA.IMAGE_SELECTORS))
        self.assertEqual(values["AI_GATEWAY_API_KEY"], self.settings["AI_GATEWAY_API_KEY"])
        self.assertEqual((self.state / "installation.env").stat().st_mode & 0o777, 0o600)
        self.assertEqual([c[-1] for c, _ in commands if c[0] == "bash"], ["up", "logs", "down"])
        for command, options in commands:
            if command[0] == "bash":
                self.assertEqual(options["env"]["RUNTIME_STATE_DIRECTORY"], str(self.state / ".ioc-runtime"))
                self.assertEqual(options["env"]["PYTHON"], sys.executable)

    def test_source_build_uses_its_own_image_tag(self):
        remote_image = "registry.example.invalid/noa:current"
        self.settings["NOA_A2A_IMAGE"] = remote_image
        commands = []
        with patch.dict(os.environ, {"NOA_A2A_IMAGE": remote_image}):
            self.execute(lambda command, **options: commands.append((command, options)))
        build, options = next((c, o) for c, o in commands if c[:2] == ["docker", "build"])
        local_image = "local/ioc-scale-cf-deployment-noa-a2a:dev"
        self.assertEqual(build[build.index("--tag") + 1], local_image)
        self.assertEqual(options["env"]["NOA_A2A_IMAGE"], local_image)
        self.assertFalse(any(remote_image in command for command, _ in commands))

    def test_down_before_first_start_needs_no_source_download_or_docker(self):
        with patch.object(NOA, "runtime_source") as source:
            NOA.execute("down", self.settings, self.root)
        source.assert_not_called()

    def test_interrupting_logs_or_status_does_not_stop_the_mas(self):
        for action in ("logs", "status"):
            with self.subTest(action=action), \
                 patch("sys.argv", ["noa_a2a.py", action]), \
                 patch.object(NOA, "execute", side_effect=KeyboardInterrupt) as execute, \
                 self.assertRaises(SystemExit) as exited:
                NOA.main()
            self.assertEqual(exited.exception.code, 130)
            execute.assert_called_once_with(action)

    def test_bootstrap_uses_existing_gh_auth_for_private_source_and_caches_files(self):
        error = urllib.error.HTTPError("https://example.invalid", 404, "private", {}, None)
        with patch.object(NOA.urllib.request, "urlopen", side_effect=error), \
             patch.object(NOA.shutil, "which", return_value="/bin/gh"), \
             patch.object(NOA.subprocess, "run",
                          return_value=subprocess.CompletedProcess([], 0, stdout=b"upstream file")) as gh:
            result = NOA.runtime_source(self.root)
            self.assertEqual(gh.call_count, len(NOA.RUNTIME_FILES))
            self.assertTrue(all((result / name).read_bytes() == b"upstream file"
                                for name in NOA.RUNTIME_FILES))
            NOA.runtime_source(self.root)
            self.assertEqual(gh.call_count, len(NOA.RUNTIME_FILES))


if __name__ == "__main__":
    unittest.main()

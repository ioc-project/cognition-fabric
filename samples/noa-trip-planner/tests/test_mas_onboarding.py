"""Development checks for the separate NOA declaration; never imports/runs NOA."""

import ast
import json
from pathlib import Path
import unittest

LOCAL = Path(__file__).resolve().parents[1]
SOURCE = LOCAL / "noa-trip-planner/src/noa_trip_planner/multi_agent_system.py"
DECLARATION = LOCAL / "mas-onboarding/noa-mas-local.json"


def string(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.Name) and node.id in {"START", "END"}:
        return f"__{node.id.lower()}__"
    return None


class NOADeclarationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.value = json.loads(DECLARATION.read_text())
        cls.tree = ast.parse(SOURCE.read_text())
        cls.workflow = next(
            node
            for node in ast.walk(cls.tree)
            if isinstance(node, ast.FunctionDef)
            and node.name == "create_multi_agent_system"
        )

    def test_runtime_ids_and_descriptions_match_the_source(self):
        descriptions = {}
        for node in ast.walk(self.tree):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "ioa_observe_agent"
            ):
                keywords = {item.arg: string(item.value) for item in node.keywords}
                descriptions[keywords.get("name")] = keywords.get("description")
        ids = {entry["agent_id"] for entry in self.value["agents"]}
        self.assertEqual(
            ids, {"moderator", "schedule_agent", "itinerary_agent", "concierge_agent"}
        )
        for entry in self.value["agents"]:
            self.assertEqual(entry["description"], descriptions[entry["agent_id"]])

    def test_visible_edges_are_exactly_the_source_projection(self):
        graph = self.value["topologies"][0]
        visible = {entry["id"] for entry in graph["nodes"]}
        moderator_targets = set()
        for node in ast.walk(self.workflow):
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if (
                        isinstance(target, ast.Subscript)
                        and isinstance(target.value, ast.Name)
                        and target.value.id == "conditional_edges_dict"
                    ):
                        moderator_targets.add(string(node.value))
        expected = set()
        source_edges = set()
        for node in ast.walk(self.workflow):
            if not isinstance(node, ast.Call) or not isinstance(
                node.func, ast.Attribute
            ):
                continue
            if node.func.attr == "add_edge":
                source, destination = map(string, node.args[:2])
                source_edges.add((source, destination))
                if source in visible and destination in visible:
                    expected.add((source, destination))
            elif node.func.attr == "add_conditional_edges":
                source = string(node.args[0])
                targets = (
                    moderator_targets
                    if source == "moderator"
                    else set(ast.literal_eval(node.args[2]).values())
                )
                expected.update(
                    (source, target)
                    for target in targets
                    if source in visible and target in visible
                )
        # Collapse the non-agent finalization helper into the completion edge.
        self.assertIn(("moderator", "finalize"), source_edges)
        self.assertIn(("finalize", "__end__"), source_edges)
        expected.add(("moderator", "__end__"))
        actual = {(entry["source"], entry["target"]) for entry in graph["edges"]}
        self.assertEqual(actual, expected)
        self.assertEqual(len(actual), 8)
        self.assertEqual(graph["completeness"], "partial")
        self.assertIn(("moderator", "__end__"), actual)

    def test_markers_are_independently_optional_and_not_agents(self):
        original = self.value["topologies"][0]
        agent_ids = {entry["agent_id"] for entry in self.value["agents"]}
        for start in (False, True):
            for end in (False, True):
                with self.subTest(start=start, end=end):
                    nodes = [
                        entry
                        for entry in original["nodes"]
                        if entry.get("type")
                        not in (([] if start else ["start"]) + ([] if end else ["end"]))
                    ]
                    ids = {entry["id"] for entry in nodes}
                    edges = [
                        entry
                        for entry in original["edges"]
                        if entry["source"] in ids and entry["target"] in ids
                    ]
                    self.assertEqual(
                        {
                            entry["id"]
                            for entry in nodes
                            if entry.get("type", "agent") == "agent"
                        },
                        agent_ids,
                    )
                    self.assertEqual(len(edges), 6 + int(start) + int(end))
                    self.assertTrue(
                        all(
                            entry["source"] in ids and entry["target"] in ids
                            for entry in edges
                        )
                    )

    def test_runtime_tool_definitions_match_source_declarations(self):
        source = ast.parse(
            (
                LOCAL / "noa-trip-planner/src/noa_trip_planner/agents/tools.py"
            ).read_text()
        )
        functions = {
            node.name: node
            for node in ast.walk(source)
            if isinstance(node, ast.FunctionDef)
        }
        for tool in self.value["tools"]:
            function = functions[tool["tool_id"]]
            definition = tool["definition"]
            self.assertEqual(definition["name"], function.name)
            self.assertEqual(definition["description"], ast.get_docstring(function))
            properties = {arg.arg: {"type": "string"} for arg in function.args.args}
            self.assertTrue(
                all(
                    isinstance(arg.annotation, ast.Name) and arg.annotation.id == "str"
                    for arg in function.args.args
                )
            )
            self.assertEqual(
                definition["inputSchema"],
                {
                    "type": "object",
                    "properties": properties,
                    "required": list(properties),
                    "additionalProperties": False,
                },
            )

    def test_no_provider_or_output_identity_is_fabricated(self):
        self.assertEqual(self.value["mcp_servers"], [])
        self.assertNotIn("cognition_engine_ids", self.value)
        self.assertTrue(all("provider" not in tool for tool in self.value["tools"]))
        self.assertNotIn("id", self.value)
        self.assertNotIn("workspace_id", self.value)
        for entry in self.value["agents"]:
            self.assertNotIn("cf_agent_id", entry)
            self.assertNotIn("url", entry)
        registry = ast.parse(
            (
                LOCAL / "noa-trip-planner/src/noa_trip_planner/tool_registry.py"
            ).read_text()
        )
        assignments = ast.literal_eval(
            next(n.value for n in registry.body if isinstance(n, ast.Assign))
        )
        self.assertEqual(
            {t["tool_id"] for t in self.value["tools"]},
            {t for ts in assignments.values() for t in ts},
        )
        for node in self.value["topologies"][0]["nodes"]:
            if node.get("type", "agent") == "agent":
                self.assertEqual(
                    node["tool_ids"], list(assignments.get(node["id"], ()))
                )
            else:
                self.assertNotIn("tool_ids", node)


if __name__ == "__main__":
    unittest.main()

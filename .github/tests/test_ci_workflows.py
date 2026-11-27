# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

import ast
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import textwrap
import unittest


WORKFLOWS = Path(__file__).resolve().parents[1] / "workflows"
SUITES = (
    "api", "cfn", "management", "ui", "demo-ce", "template-ce", "noa",
    "generation", "automation", "docs",
)


class CIStatusTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source = (WORKFLOWS / "ci.yaml").read_text()
        job = source.split("\n  ci-summary:\n", 1)[1]
        if not re.search(r"(?m)^    name: ci-summary$", job):
            raise AssertionError("ci-summary must report the organization’s required check name")
        block = re.search(r"(?m)^        run: \|\n((?:          [^\n]*\n|\n)+)", job)
        if not block:
            raise AssertionError("ci-summary must have an executable status check")
        # Execute the workflow's actual script, including its JSON/boolean handling.
        cls.script = textwrap.dedent(block[1])

    def results(self):
        return {name: {"result": "success"} for name in (*SUITES, "images")}

    def check_status(self, results, include_images):
        env = dict(os.environ, NEEDS_JSON=json.dumps(results),
                   INCLUDE_IMAGES_JSON=json.dumps(include_images))
        return subprocess.run(["bash", "-c", self.script], env=env, text=True,
                              capture_output=True, timeout=10)

    def test_success_with_absent_true_and_false_inputs(self):
        for value in ("", None, True, False):
            with self.subTest(include_images=value):
                result = self.check_status(self.results(), value)
                self.assertEqual(result.returncode, 0, result.stderr)

    def test_release_can_skip_only_the_image_job(self):
        results = self.results()
        results["images"]["result"] = "skipped"
        result = self.check_status(results, False)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_missing_or_non_boolean_false_cannot_allow_skipped_images(self):
        results = self.results()
        results["images"]["result"] = "skipped"
        for value in ("", None, True, 0, "false"):
            with self.subTest(include_images=value):
                result = self.check_status(results, value)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("images", result.stderr)

    def test_every_suite_must_succeed_even_when_images_are_disabled(self):
        for name in SUITES:
            for status in ("failure", "cancelled", "skipped"):
                with self.subTest(job=name, status=status):
                    results = self.results()
                    results["images"]["result"] = "skipped"
                    results[name]["result"] = status
                    result = self.check_status(results, False)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn(name, result.stderr)

    def test_image_failure_or_cancellation_always_fails(self):
        for status in ("failure", "cancelled"):
            for value in ("", True, False):
                with self.subTest(status=status, include_images=value):
                    results = self.results()
                    results["images"]["result"] = status
                    result = self.check_status(results, value)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn("images", result.stderr)

    def test_missing_results_fail_closed(self):
        for results in ({}, {name: {"result": "success"} for name in SUITES}):
            with self.subTest(jobs=list(results)):
                result = self.check_status(results, False)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("Missing required job results", result.stderr)


class ImagePublishingTests(unittest.TestCase):
    cases = (
        ("push", "refs/heads/main", True),
        ("workflow_dispatch", "refs/heads/main", True),
        ("workflow_dispatch", "refs/heads/chore/test-images", True),
        ("pull_request", "refs/pull/135/merge", False),
        ("pull_request", "refs/heads/main", False),
        ("pull_request_target", "refs/heads/main", False),
        ("push", "refs/heads/chore/test-images", False),
        ("push", "refs/tags/cfn/v1.0.0", False),
    )

    @classmethod
    def setUpClass(cls):
        source = (WORKFLOWS / "ci.yaml").read_text()
        job = source.split("\n  images:\n", 1)[1].split("\n  ci-summary:\n", 1)[0]
        cls.login = re.search(r"docker/login-action@[^\n]+\n        if: ([^\n]+)", job)[1]
        cls.push = re.search(r"(?m)^          push: (.+)$", job)[1]
        cls.platforms = re.search(r"(?m)^          platforms: >-\n((?:            .*\n)+)", job)[1]
        cls.tags_script = textwrap.dedent(re.search(
            r"(?m)^        run: \|\n((?:          [^\n]*\n|\n)+)", job
        )[1])

    def expression_value(self, expression, event, ref):
        # These workflow expressions use string equality and boolean operators.
        # Evaluate that subset with Python's equivalent short-circuit semantics.
        expression = expression.strip().removeprefix("${{").removesuffix("}}").strip()
        expression = " ".join(expression.split())
        expression = expression.replace("github.event_name", "event").replace("github.ref", "ref")
        expression = expression.replace("&&", " and ").replace("||", " or ")
        tree = ast.parse(expression, mode="eval")
        allowed = (ast.Expression, ast.BoolOp, ast.And, ast.Or, ast.Compare,
                   ast.Eq, ast.Constant, ast.Name, ast.Load)
        self.assertTrue(all(isinstance(node, allowed) for node in ast.walk(tree)))
        return eval(compile(tree, "<workflow expression>", "eval"),
                    {"__builtins__": {}}, {"event": event, "ref": ref})

    def test_login_and_push_only_for_main_pushes_or_manual_runs(self):
        for event, ref, publish in self.cases:
            with self.subTest(event=event, ref=ref):
                self.assertIs(self.expression_value(self.login, event, ref), publish)
                self.assertIs(self.expression_value(self.push, event, ref), publish)

    def test_published_images_build_both_architectures(self):
        for event, ref, publish in self.cases:
            with self.subTest(event=event, ref=ref):
                expected = "linux/amd64,linux/arm64" if publish else "linux/amd64"
                self.assertEqual(self.expression_value(self.platforms, event, ref), expected)

    def test_manual_and_pr_runs_never_select_main_aliases(self):
        image = "ghcr.io/ioc-project/test-image"
        sha = "0123456789abcdef0123456789abcdef01234567"
        for event, ref, _ in self.cases:
            for component in ("cfn", "cf-mgmt", "cf-ui", "demo-ce", "template-ce"):
                with self.subTest(event=event, ref=ref, component=component), tempfile.TemporaryDirectory() as temporary:
                    output = Path(temporary) / "output"
                    env = dict(os.environ, GITHUB_EVENT_NAME=event, GITHUB_REF=ref,
                               GITHUB_SHA=sha, GITHUB_OUTPUT=str(output), IMAGE=image,
                               COMPONENT=component)
                    subprocess.run(["bash", "-c", self.tags_script], env=env,
                                   capture_output=True, text=True, check=True, timeout=10)
                    lines = output.read_text().splitlines()
                    self.assertEqual(lines[0], "tags<<EOF")
                    self.assertEqual(lines[-1], "EOF")
                    tags = lines[1:-1]
                    if event == "push" and ref == "refs/heads/main":
                        self.assertEqual(tags[0], image + ":latest")
                        self.assertRegex(tags[1], re.escape(image) + r":\d{4}-\d{2}-\d{2}-0123456$")
                        self.assertEqual(tags[2:], [image + ":main"] if component in ("cf-mgmt", "cf-ui") else [])
                    else:
                        self.assertEqual(tags, [image + ":ci-0123456"])


class ActionPinTests(unittest.TestCase):
    def test_remote_actions_have_full_sha_pins_and_version_comments(self):
        for name in ("ci.yaml", "release.yaml", "pages.yaml"):
            for number, line in enumerate((WORKFLOWS / name).read_text().splitlines(), 1):
                match = re.search(r"\buses:\s*([^\s#]+)", line)
                if not match or match[1].startswith("./"):
                    continue
                with self.subTest(workflow=name, line=number):
                    self.assertRegex(line, r"uses:\s*[^@\s]+@[0-9a-f]{40}\s+# v\d+\.\d+\.\d+$")

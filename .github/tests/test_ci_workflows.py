# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

import json
import os
from pathlib import Path
import re
import subprocess
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
        job = source.split("\n  ci-status:\n", 1)[1]
        block = re.search(r"(?m)^        run: \|\n((?:          [^\n]*\n|\n)+)", job)
        if not block:
            raise AssertionError("CI Status must have an executable status check")
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


class ActionPinTests(unittest.TestCase):
    def test_remote_actions_have_full_sha_pins_and_version_comments(self):
        for name in ("ci.yaml", "release.yaml", "pages.yaml"):
            for number, line in enumerate((WORKFLOWS / name).read_text().splitlines(), 1):
                match = re.search(r"\buses:\s*([^\s#]+)", line)
                if not match or match[1].startswith("./"):
                    continue
                with self.subTest(workflow=name, line=number):
                    self.assertRegex(line, r"uses:\s*[^@\s]+@[0-9a-f]{40}\s+# v\d+\.\d+\.\d+$")

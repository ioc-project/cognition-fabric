# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

import importlib.util
import json
import re
from pathlib import Path
import tempfile
import unittest


def module(name):
    path = Path(__file__).resolve().parents[1] / "scripts" / (name + ".py")
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


release = module("release_target")


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for component, (_, _, metadata) in release.COMPONENTS.items():
            folder = self.root / component
            folder.mkdir(parents=True)
            if metadata == "pyproject.toml":
                text = '[project]\nversion = "1.0.0"\n'
            elif metadata == "package.json":
                text = '{"version":"1.0.0"}'
                (folder / "package-lock.json").write_text(json.dumps({"version": "1.0.0", "packages": {"": {"version": "1.0.0"}}}))
            else:
                text = "1.0.0\n"
            (folder / metadata).write_text(text)

    def test_all_six_targets_and_nested_prefixes(self):
        for component, (image, dockerfile, _) in release.COMPONENTS.items():
            with self.subTest(component=component):
                target = release.resolve(component + "/v1.0.0", self.root)
                self.assertEqual(target["image"], image)
                self.assertEqual(target["dockerfile"], dockerfile)
                self.assertEqual(target["publish_image"], component != "api")
                self.assertEqual(target["image_tag"], "v1.0.0")
                if component != "api":
                    self.assertTrue(target["image"].startswith("ghcr.io/ioc-project/"))

    def test_main_and_component_releases_use_the_same_images(self):
        source = (Path(__file__).resolve().parents[1] / "workflows/ci.yaml").read_text()
        matrix = re.findall(r"(?m)^          - component: (\S+)\n            image: (\S+)$", source)
        expected = {component.removeprefix("samples/"): image
                    for component, (image, _, _) in release.COMPONENTS.items() if image}
        self.assertEqual(len(matrix), len(expected))
        self.assertEqual(dict(matrix), expected)

    def test_invalid_tags_and_versions(self):
        for tag in ["v1.0.0", "other/v1.0.0", "samples/v1.0.0", "cfn/v01.0.0", "cfn/v1.0.0-01", "cfn/v1.0.0+build", "cfn/v1.0.1", "cfn/v1.0.0\nevil=true", "cfn/v1.0.0-" + "a" * 128]:
            with self.subTest(tag=tag), self.assertRaises(ValueError):
                release.resolve(tag, self.root)

    def test_ui_lock_mismatch_is_rejected(self):
        (self.root / "cf-ui/package-lock.json").write_text('{"version":"1.0.1","packages":{"":{"version":"1.0.0"}}}')
        with self.assertRaises(ValueError):
            release.resolve("cf-ui/v1.0.0", self.root)

    def test_prerelease(self):
        (self.root / "api/VERSION").write_text("1.1.0-rc.1\n")
        self.assertEqual(release.resolve("api/v1.1.0-rc.1", self.root)["version"], "1.1.0-rc.1")

    def test_historical_ui_tags_do_not_release(self):
        for tag in release.LEGACY_TAGS:
            self.assertEqual(release.resolve(tag, self.root)["publish_image"], False)

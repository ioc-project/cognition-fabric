# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

import importlib.util
import json
import os
import subprocess
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
pages = module("build_pages")


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


class PagesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.site = self.root / "site"
        self.site.mkdir()
        (self.site / "index.html").write_text('<a href="/cognition-fabric/demo-ce/overview/">Demo CE</a>')
        self.viewer = self.root / "viewer.html"
        self.viewer.write_text('<script>SwaggerUIBundle({url: "openapi.json"})</script>')
        self.schema = self.root / "schema.json"
        self.schema.write_text('{"openapi":"3.0.0","paths":{}}')
        self.output = self.root / "pages"

    def test_both_sites_are_staged_without_overwriting_existing_output(self):
        pages.stage(self.site, self.viewer, self.schema, self.output)
        self.assertEqual((self.output / "index.html").read_text(), (self.site / "index.html").read_text())
        self.assertEqual((self.output / "mgmt-api/index.html").read_text(), self.viewer.read_text())
        self.assertEqual((self.output / "mgmt-api/openapi.json").read_text(), self.schema.read_text())
        with self.assertRaises(ValueError):
            pages.stage(self.site, self.viewer, self.schema, self.output)

    def test_local_plans_and_path_collisions_are_rejected(self):
        for name in ("plans", ".local"):
            with self.subTest(directory=name):
                (self.site / name).mkdir()
                with self.assertRaises(ValueError):
                    pages.stage(self.site, self.viewer, self.schema, self.output)
                (self.site / name).rmdir()
        (self.site / "mgmt-api").mkdir()
        with self.assertRaises(ValueError):
            pages.stage(self.site, self.viewer, self.schema, self.output)


    def test_pages_urls_with_or_without_a_trailing_slash_keep_the_viewer_under_the_site(self):
        repository = Path(__file__).resolve().parents[2]
        config_source = (repository / "samples/docs-site/docusaurus.config.js").read_text()
        script = (
            "const {default: config} = await import('data:text/javascript,' + encodeURIComponent("
            + json.dumps(config_source) + ")); "
            "const viewer = config.themeConfig.navbar.items.find(x => x.label === 'Management API'); "
            "console.log(JSON.stringify({base: config.baseUrl, viewer: viewer.href}));"
        )
        for url, base in [
            ("https://example.invalid", "/"),
            ("https://example.invalid/", "/"),
            ("https://example.invalid/cognition-fabric", "/cognition-fabric/"),
            ("https://example.invalid/cognition-fabric/", "/cognition-fabric/"),
        ]:
            with self.subTest(url=url):
                env = dict(os.environ, PAGES_URL=url)
                config = json.loads(subprocess.check_output(
                    ["node", "--input-type=module", "-e", script], env=env, text=True, timeout=10
                ))
                self.assertEqual(config["base"], base)
                self.assertEqual(config["viewer"], "https://example.invalid" + base + "mgmt-api/")
                # The artifact is mounted at the Pages base; its directory
                # geometry must remain identical for both base URL forms.
                output = self.root / ("pages-case-" + str(len(list(self.root.glob("pages-case-*")))))
                pages.stage(self.site, self.viewer, self.schema, output)
                self.assertTrue((output / "mgmt-api/index.html").is_file())
                self.assertEqual((output / "mgmt-api/openapi.json").read_bytes(), self.schema.read_bytes())

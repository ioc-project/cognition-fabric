#!/usr/bin/env python3
# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Stage the docs site and Management viewer in one GitHub Pages artifact.

The artifact is mounted at the configured Pages base URL, so mgmt-api always
stays directly under its root. Docusaurus normalizes the URL before building;
staging preserves its generated links without adding the base path again.
"""

import argparse
import json
from pathlib import Path
import shutil


def stage(site, viewer, schema, output):
    if not (site / "index.html").is_file():
        raise ValueError("Docs-site build must contain index.html")
    if (site / "mgmt-api").exists():
        raise ValueError("Docs site must reserve the mgmt-api path for the Management viewer")
    if any(part in {"plans", ".local"} for path in site.rglob("*") for part in path.relative_to(site).parts):
        raise ValueError("Local plans and private files must not be published")
    if any(path.is_symlink() for path in site.rglob("*")):
        raise ValueError("Pages build must not include symlinks")
    if "paths" not in json.loads(schema.read_text(encoding="utf-8")):
        raise ValueError("Management schema has no paths")
    viewer_text = viewer.read_text(encoding="utf-8")
    if 'url: "openapi.json"' not in viewer_text:
        raise ValueError("Management viewer must load sibling openapi.json")
    if output.exists() and any(output.iterdir()):
        raise ValueError("Pages output must be new or empty")
    shutil.copytree(site, output, dirs_exist_ok=True)
    mgmt = output / "mgmt-api"
    mgmt.mkdir()
    (mgmt / "index.html").write_text(viewer_text, encoding="utf-8")
    shutil.copyfile(schema, mgmt / "openapi.json")
    (output / ".nojekyll").touch()
    return output


def main():
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site-build", type=Path, default=root / "samples/docs-site/build")
    parser.add_argument("--viewer", type=Path, default=root / "cf-mgmt/docs/index.html")
    parser.add_argument("--schema", type=Path, default=root / "api/mgmt/openapi/openapi.json")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(stage(args.site_build, args.viewer, args.schema, args.output))


if __name__ == "__main__":
    main()

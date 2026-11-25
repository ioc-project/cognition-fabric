#!/usr/bin/env python3
# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Resolve an allowlisted folder release tag without publishing anything."""

import argparse
import json
from pathlib import Path
import re
import tomllib

COMPONENTS = {
    "cfn": ("ghcr.io/ioc-project/ioc-scale-cfn-svc", "cfn/Dockerfile", "VERSION"),
    "cf-mgmt": ("ghcr.io/ioc-project/ioc-scale-cf-mgmt-svc", "cf-mgmt/Dockerfile", "pyproject.toml"),
    "cf-ui": ("ghcr.io/ioc-project/ioc-scale-cf-ui", "cf-ui/ci/docker/Dockerfile.next", "package.json"),
    "samples/demo-ce": ("ghcr.io/ioc-project/ioc-scale-cf-demo-ce/demo-ce", "samples/demo-ce/Dockerfile", "VERSION"),
    "samples/template-ce": ("ghcr.io/ioc-project/ioc-scale-cf-demo-ce/template-ce", "samples/template-ce/Dockerfile", "pyproject.toml"),
    "api": ("", "", "VERSION"),
}
LEGACY_TAGS = {"cf-ui/v0.0.1-rc0", "cf-ui/v0.0.1-rc1", "cf-ui/v0.2.0", "cf-ui/v0.2.1"}
SEMVER = re.compile(r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$")


def component_version(component, root):
    _, _, metadata = COMPONENTS[component]
    path = root / component / metadata
    if metadata == "pyproject.toml":
        return tomllib.loads(path.read_text(encoding="utf-8"))["project"]["version"]
    if metadata == "package.json":
        found = json.loads(path.read_text(encoding="utf-8"))["version"]
        lock = json.loads((path.parent / "package-lock.json").read_text(encoding="utf-8"))
        if lock["version"] != found or lock["packages"][""]["version"] != found:
            raise ValueError("UI package/lock versions disagree")
        return found
    return path.read_text(encoding="utf-8").strip()


def resolve(tag, root):
    if tag in LEGACY_TAGS:
        return {"historical": True, "publish_image": False, "tag": tag}
    if "/v" not in tag:
        raise ValueError("Expected <component>/vX.Y.Z[-prerelease]")
    component, version = tag.rsplit("/v", 1)
    if component not in COMPONENTS:
        raise ValueError(f"Unsupported release component: {component}")
    match = SEMVER.fullmatch(version)
    if not match or (match[4] and any(x.isdigit() and len(x) > 1 and x[0] == "0" for x in match[4].split("."))):
        raise ValueError("Invalid semantic version; build metadata is not supported in image tags")
    if len("v" + version) > 128:
        raise ValueError("Version exceeds the container tag length limit")
    image, dockerfile, _ = COMPONENTS[component]
    found = component_version(component, root)
    if found != version:
        raise ValueError(f"Tag version {version} differs from {component} metadata {found}")
    return {"historical": False, "component": component, "version": version,
            "image": image, "dockerfile": dockerfile, "image_tag": "v" + version,
            "publish_image": bool(image), "tag": tag}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tag", nargs="?")
    parser.add_argument("--validate-all", action="store_true", help="Validate current metadata for all six components")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--github-output", type=Path)
    args = parser.parse_args()
    if args.validate_all:
        if args.tag or args.github_output:
            parser.error("--validate-all cannot be combined with a tag or GitHub outputs")
        result = [resolve(component + "/v" + component_version(component, args.root), args.root)
                  for component in COMPONENTS]
    else:
        if not args.tag:
            parser.error("a release tag or --validate-all is required")
        result = resolve(args.tag, args.root)
    if args.github_output:
        with args.github_output.open("a", encoding="utf-8") as output:
            for key, value in result.items():
                output.write(f"{key}={str(value).lower() if isinstance(value, bool) else value}\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

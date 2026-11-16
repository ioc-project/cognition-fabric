#!/usr/bin/env python3
# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Generate or check the canonical Management schema without starting the app."""

import argparse
import copy
import json
import os
from pathlib import Path
import sys

COMPONENT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT = COMPONENT_ROOT.parent / "api/mgmt/openapi/openapi.json"
HTTP_METHODS = {"get", "post", "put", "patch", "delete", "options", "head", "trace"}
INTERNAL_PATHS = {
    "/api/cognition-fabric-nodes/register",
    "/api/cognition-fabric-nodes/{id}",
    "/api/cognition-fabric-nodes/{id}/heartbeat",
    "/api/cognition-engines",
    "/api/cognition-engines/{ce_id}",
}


def canonical_spec():
    # Code generation must not load a developer's private environment or depend
    # on an APPLICATION_VERSION override. No application lifespan is entered.
    os.environ["PYTHON_DOTENV_DISABLED"] = "1"
    os.environ.pop("APPLICATION_VERSION", None)
    sys.path.insert(0, str(COMPONENT_ROOT / "src"))
    from server.main import app

    spec = copy.deepcopy(app.openapi())
    # Preserve the existing committed Management schema format.
    if spec.get("openapi") == "3.1.0":
        spec["openapi"] = "3.0.0"
    missing = INTERNAL_PATHS - spec["paths"].keys()
    if missing:
        raise ValueError(f"Internal Management routes missing from schema: {sorted(missing)}")
    for path in INTERNAL_PATHS:
        for method, operation in spec["paths"][path].items():
            if method in HTTP_METHODS:
                operation["x-internal"] = True
                operation["x-callers"] = (
                    ["CFN"] if path.endswith(("/register", "/heartbeat")) else ["CFN", "cf-ui"]
                )
    return spec


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Compare without rewriting the working tree")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args(argv)
    rendered = json.dumps(canonical_spec(), indent=2) + "\n"
    if args.check:
        if not args.output.exists() or args.output.read_text(encoding="utf-8") != rendered:
            print(f"Management schema is stale: {args.output}", file=sys.stderr)
            return 1
        print("Management schema is current")
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
        print(f"Generated {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

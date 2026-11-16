#!/usr/bin/env python3
# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Validate the two external CE OpenAPI3 contracts using the pinned validator.

Run through `make -C api openapi-check`. Management retains its existing exported
schema policy and is deliberately outside this new-contract structural check.
"""
from importlib.metadata import version
from pathlib import Path

from openapi_spec_validator import validate
from openapi_spec_validator.readers import read_from_filename

EXPECTED_VERSION = "0.7.2"
if version("openapi-spec-validator") != EXPECTED_VERSION:
    raise SystemExit(f"Use openapi-spec-validator=={EXPECTED_VERSION}; run make -C api openapi-check")

root = Path(__file__).resolve().parents[1]
for name in ("cfn-ce.yaml", "ce-callbacks.yaml"):
    path = root / "ce/openapi" / name
    specification, base_uri = read_from_filename(str(path))
    if specification.get("openapi") != "3.0.3":
        raise SystemExit(f"{path}: expected OpenAPI3.0.3")
    validate(specification, base_uri=base_uri)
    print(f"Valid OpenAPI3.0.3: {path.relative_to(root)}")

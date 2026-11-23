#!/usr/bin/env python3
# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Bind the operator spec bytes to the Envoy template using resolved Compose paths."""

import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile

MARKER = b"__SIDECAR_SPEC_SHA256__"
DEFAULT_ACTIVATION = (
    Path(__file__).resolve().parents[2] / ".local/deploy-envoy/activation"
)


def prepare(config):
    service = config["services"]["ioc-scale-enforcement-proxy-envoy"]
    mounts = {
        item["target"]: Path(item["source"]).resolve()
        for item in service["volumes"]
        if item["type"] == "bind"
    }
    spec = mounts["/etc/sidecar/sidecar-spec.yaml"]
    template = mounts["/etc/envoy-template/envoy.yaml"]
    generated = mounts["/etc/envoy"]
    activation = mounts["/etc/sidecar/activation"]
    output = generated / "envoy.yaml"
    # Validate all inputs before creating output. Never write an operator input
    # or an owner-managed activation directory, even with overlapping overrides.
    if output.resolve() in (spec, template) or generated == activation:
        raise ValueError(
            "generated configuration must be separate from operator inputs"
        )
    spec_bytes = spec.read_bytes()
    template_bytes = template.read_bytes()
    if MARKER not in template_bytes:
        raise ValueError(f"missing spec digest marker in {template}")
    if not activation.is_dir() and activation != DEFAULT_ACTIVATION.resolve():
        raise ValueError(f"owner-managed activation directory must exist: {activation}")
    rendered = template_bytes.replace(
        MARKER, hashlib.sha256(spec_bytes).hexdigest().encode("ascii")
    )
    generated.mkdir(parents=True, exist_ok=True)
    if activation == DEFAULT_ACTIVATION.resolve():
        activation.mkdir(parents=True, exist_ok=True)
    if not output.is_file() or output.read_bytes() != rendered:
        name = None
        try:
            with tempfile.NamedTemporaryFile(
                dir=generated, prefix=".envoy-", delete=False
            ) as temporary:
                name = temporary.name
                temporary.write(rendered)
                os.fchmod(temporary.fileno(), 0o644)
            os.replace(name, output)
        finally:
            if name and os.path.exists(name):
                os.unlink(name)
    return hashlib.sha256(rendered).hexdigest()


def main():
    try:
        print(prepare(json.load(sys.stdin)))
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"Envoy preparation: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())

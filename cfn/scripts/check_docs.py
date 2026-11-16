#!/usr/bin/env python3
# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Compare pinned swag output with the working tree without rewriting it."""
import os
import shutil
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
swag = os.environ.get("SWAG", "swag")
# The v1.16.6 module still reports v1.16.4 through --version. Verify the
# actual compiled module version instead of the stale CLI display string.
executable = shutil.which(swag)
if executable is None:
    raise SystemExit("Install github.com/swaggo/swag/cmd/swag@v1.16.6 or set SWAG")
metadata = subprocess.check_output(["go", "version", "-m", executable], text=True)
if not any(line.split()[:3] == ["mod", "github.com/swaggo/swag", "v1.16.6"] for line in metadata.splitlines()):
    raise SystemExit("Expected swag built from github.com/swaggo/swag v1.16.6")
with tempfile.TemporaryDirectory(prefix="cf-swagger-") as temporary:
    output = Path(temporary) / "api"  # swag derives the Go package from this directory name.
    subprocess.run([swag, "init", "--parseDependency", "--parseInternal", "--dir", "./cmd/cfn,./pkg/app,./pkg/app/httpapi/cognitionengine", "--output", str(output)], cwd=root, check=True)
    for name in ("docs.go", "swagger.json", "swagger.yaml"):
        current = root / "docs/api" / name
        generated = output / name
        if not current.exists() or current.read_bytes() != generated.read_bytes():
            raise SystemExit(f"{current.relative_to(root)} is stale; run make -C cfn docs")
print("CFN internal Swagger is current.")

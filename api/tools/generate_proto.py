#!/usr/bin/env python3
# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Generate Go API and NOA Python bindings from the canonical protos only."""
import argparse
import difflib
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
API = ROOT / "api"
MODULE = "github.com/cisco-eti/cognition-fabric/api"
PROTOC = os.environ.get("PROTOC", "protoc")
PROTOS = [API / "ce/proto/ce/v1/ce.proto", API / "enforcement/proto/enforcement/v1/enforcement.proto"]


def check_tool(command, expected):
    found = subprocess.check_output([command, "--version"], text=True).strip()
    if found != expected:
        raise SystemExit(f"Expected {command}: {expected}; found {found}")


def synchronize(target, generated, check):
    if check:
        if not target.exists() or target.read_bytes() != generated:
            before = target.read_text() if target.exists() else ""
            after = generated.decode()
            print("".join(difflib.unified_diff(before.splitlines(True), after.splitlines(True), fromfile=str(target), tofile="regenerated")))
            raise SystemExit(f"{target.relative_to(ROOT)} is stale; run make -C api proto")
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(generated)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Compare temporary output without rewriting committed bindings")
    args = parser.parse_args()
    check_tool(PROTOC, "libprotoc 35.1")
    check_tool("protoc-gen-go", "protoc-gen-go v1.36.12")
    check_tool("protoc-gen-go-grpc", "protoc-gen-go-grpc 1.6.2")
    with tempfile.TemporaryDirectory(prefix="cf-proto-") as directory:
        output = Path(directory)
        subprocess.run([PROTOC, "-I", str(API), "--go_out=" + str(output), "--go_opt=module=" + MODULE, "--go-grpc_out=" + str(output), "--go-grpc_opt=module=" + MODULE, *map(str, PROTOS)], check=True)
        generated_paths = {p.relative_to(output) for p in output.rglob("*.pb.go")}
        current_paths = {p.relative_to(API) for area in ("ce/v1", "enforcement/v1") for p in (API / area).glob("*.pb.go")}
        if args.check and current_paths != generated_paths:
            raise SystemExit(f"Generated Go file set differs: current={sorted(map(str, current_paths))}, expected={sorted(map(str, generated_paths))}")
        for relative in sorted(generated_paths):
            synchronize(API / relative, (output / relative).read_bytes(), args.check)
        if not args.check:
            for relative in current_paths - generated_paths:
                (API / relative).unlink()
        python_output = output / "noa"
        python_output.mkdir()
        enforcement = PROTOS[1]
        subprocess.run([PROTOC, "-I", str(enforcement.parent), "--python_out=" + str(python_output), str(enforcement)], check=True)
        binding = (python_output / "enforcement_pb2.py").read_text().replace("'enforcement_pb2'", "'noa_trip_planner.generated.enforcement_pb2'")
        target = ROOT / "samples/noa-trip-planner/src/noa_trip_planner/generated/enforcement_pb2.py"
        synchronize(target, binding.encode(), args.check)
    print("Canonical Go and NOA bindings are current." if args.check else "Generated canonical Go and NOA bindings.")


if __name__ == "__main__":
    main()

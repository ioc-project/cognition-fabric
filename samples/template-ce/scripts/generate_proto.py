# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Generate CE bindings directly from api/ using the locked grpcio-tools."""
import argparse
from pathlib import Path
import tempfile
import grpc_tools
from grpc_tools import protoc

parser = argparse.ArgumentParser()
parser.add_argument("--check", action="store_true")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
repository = root.parents[1]
canonical = repository / "api/ce/proto/ce/v1/ce.proto"
with tempfile.TemporaryDirectory() as temporary:
    output = Path(temporary)
    result = protoc.main(["grpc_tools.protoc", "-I" + str(canonical.parent),
        "-I" + str(Path(grpc_tools.__file__).parent / "_proto"),
        "--python_out=" + str(output), "--grpc_python_out=" + str(output),
        str(canonical)])
    if result:
        raise SystemExit(result)
    for generated in output.glob("*.py"):
        text = generated.read_text().replace("import ce_pb2 as ce__pb2", "from . import ce_pb2 as ce__pb2")
        target = root / "src/generated" / generated.name
        if args.check:
            if not target.exists() or target.read_text() != text:
                raise SystemExit(str(target) + " is stale; run python scripts/generate_proto.py")
        else:
            target.write_text(text)

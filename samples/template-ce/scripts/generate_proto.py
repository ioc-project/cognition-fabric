"""Regenerate the local CE bindings with the locked grpcio-tools toolchain."""
import argparse
from pathlib import Path
import tempfile
import grpc_tools
from grpc_tools import protoc

parser = argparse.ArgumentParser()
parser.add_argument("--check", action="store_true")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as temporary:
    output = Path(temporary)
    result = protoc.main(["grpc_tools.protoc", "-I" + str(root / "proto"),
        "-I" + str(Path(grpc_tools.__file__).parent / "_proto"),
        "--python_out=" + str(output), "--grpc_python_out=" + str(output),
        str(root / "proto/ce.proto")])
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

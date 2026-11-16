"""Exercise GetInfo against a running Template CE. Used by CI image smoke."""
import argparse
import grpc
from generated import ce_pb2, ce_pb2_grpc


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", default="127.0.0.1:50051")
    args = parser.parse_args()
    channel = grpc.insecure_channel(args.target)
    stub = ce_pb2_grpc.CognitionEngineStub(channel)
    info = stub.GetInfo(ce_pb2.GetInfoRequest(), timeout=5)
    if info.ce_type != "CASA":
        raise SystemExit(f"unexpected GetInfo: {info}")
    print(f"GetInfo ok ce_type={info.ce_type} version={info.version}")


if __name__ == "__main__":
    main()

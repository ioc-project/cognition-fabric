"""Supervise NOA and its tool service together for the source proxy workflow."""

import fcntl
import hashlib
import json
import logging
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import threading
import time
from urllib.error import URLError
from urllib.request import ProxyHandler, build_opener

logger = logging.getLogger(__name__)


def stop(process: subprocess.Popen) -> None:
    if process.poll() is None:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait()


def run() -> int:
    directory = Path(os.environ["CFN_PROXY_CONFIG_DIR"])
    with (directory / "noa.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("Source NOA proxy mode is already running") from None
        port = int(os.environ.get("NOA_TOOLS_PORT", "8126"))
        # Check before spawning either child; never attach to an unrelated service.
        for host, target_port in [(os.environ.get("NOA_TOOLS_HOST", "0.0.0.0"), port),
                                  (os.environ.get("NOA_API_HOST", "127.0.0.1"), int(os.environ.get("NOA_API_PORT", "8125")))]:
            with socket.socket() as probe:
                probe.bind((host, target_port))
        stopping = threading.Event()
        def request_stop(signum, frame):
            stopping.set()
        signal.signal(signal.SIGINT, request_stop)
        signal.signal(signal.SIGTERM, request_stop)
        token = Path(os.environ["NOA_TOOL_TOKEN_FILE"]).read_text().strip()
        instance = hashlib.sha256(token.encode()).hexdigest()
        children = []
        try:
            tools = subprocess.Popen([sys.executable, "-m", "noa_trip_planner.tool_server"], start_new_session=True)
            children.append(tools)
            opener = build_opener(ProxyHandler({}))
            deadline = time.monotonic() + 30
            while not stopping.is_set():
                if tools.poll() is not None:
                    raise RuntimeError("NOA tool service exited during startup")
                try:
                    with opener.open(f"http://127.0.0.1:{port}/health", timeout=1) as response:
                        if json.load(response).get("instance") == instance:
                            break
                except (URLError, TimeoutError, ValueError):
                    pass
                if time.monotonic() >= deadline:
                    raise RuntimeError("NOA tool service did not become ready within 30 seconds")
                stopping.wait(0.2)
            if stopping.is_set():
                return 130
            logger.info("NOA tool service is ready; starting NOA with proxy enforcement")
            noa = subprocess.Popen([sys.executable, "-m", "noa_trip_planner.api"], start_new_session=True)
            children.append(noa)
            while not stopping.wait(0.2):
                if tools.poll() is not None:
                    raise RuntimeError("NOA tool service stopped; shutting down NOA")
                if noa.poll() is not None:
                    return noa.returncode
            return 130
        finally:
            for child in reversed(children):
                stop(child)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    try:
        code = run()
    except (OSError, RuntimeError, ValueError) as exc:
        logger.error("Source NOA proxy startup failed: %s", exc)
        code = 1
    raise SystemExit(code)


if __name__ == "__main__":
    main()

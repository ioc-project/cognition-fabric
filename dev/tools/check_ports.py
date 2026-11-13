# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Check local TCP listeners without reserving ports or confusing TIME_WAIT."""

import errno
import os
import socket
import sys


class PortCheckError(RuntimeError):
    pass


def require_ports_free(ports, bind_host=None):
    targets = [(socket.AF_INET, "127.0.0.1"), (socket.AF_INET6, "::1")]
    if bind_host and bind_host not in ("0.0.0.0", "127.0.0.1"):
        raise PortCheckError("LOCAL_CF_BIND_HOST must be 127.0.0.1 or 0.0.0.0")
    absent = {errno.ECONNREFUSED, errno.EAFNOSUPPORT, errno.EPROTONOSUPPORT,
              errno.EADDRNOTAVAIL, errno.ENETUNREACH, errno.EHOSTUNREACH}
    for port in ports:
        if not 1 <= port <= 65535:
            raise PortCheckError(f"Invalid TCP port: {port}")
        for family, host in targets:
            try:
                with socket.socket(family, socket.SOCK_STREAM) as probe:
                    probe.settimeout(0.3)
                    result = probe.connect_ex((host, port))
            except OSError as exc:
                if exc.errno in absent:
                    continue
                raise PortCheckError(f"Could not check TCP port {port} on {host}") from None
            if result == 0:
                raise PortCheckError(
                    f"Port {port} is in use on {host}. Stop that service's source/image process first."
                )
            if result not in absent:
                raise PortCheckError(f"Could not establish whether TCP port {port} on {host} is free")


def main():
    try:
        require_ports_free([int(port) for port in sys.argv[1:]], os.environ.get("LOCAL_CF_BIND_HOST"))
    except (PortCheckError, ValueError) as exc:
        sys.exit(f"Local CF: {exc}")


if __name__ == "__main__":
    main()

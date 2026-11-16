# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Keys for the registered services a CE claims when it starts or reconnects."""

from urllib.parse import urlsplit


def endpoint_keys(engine) -> set[tuple]:
    """Compare declared endpoints, without resolving DNS aliases or merging different services."""
    address = engine.health_url.rstrip("/") + engine.health_endpoint
    try:
        health = urlsplit(address)
        port = health.port if health.port is not None else (443 if health.scheme == "https" else 80)
        keys = {
            ("health", health.scheme.lower(), (health.hostname or "").lower(), port, health.path or "/", health.query)
        }
    except ValueError:
        # Legacy malformed endpoints must not prevent another CE from registering.
        keys = {("health_raw", address)}
    if engine.enforcing_url and engine.enforcing_endpoint:
        address = engine.enforcing_url
        try:
            enforcing = urlsplit(address if "://" in address else "//" + address)
            keys.add(("enforcing", (enforcing.hostname or "").lower(), enforcing.port, engine.enforcing_endpoint))
        except ValueError:
            keys.add(("enforcing_raw", address, engine.enforcing_endpoint))
    return keys

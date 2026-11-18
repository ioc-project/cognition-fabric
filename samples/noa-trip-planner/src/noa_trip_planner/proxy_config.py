# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Render CFN-owned Envoy configuration without changing deploy/."""

import argparse
import fcntl
import json
import os
from pathlib import Path
import secrets
import uuid

from noa_trip_planner.tool_registry import AGENT_TOOLS, tool_path


def write_json(path: Path, value: object) -> None:
    temporary = path.with_suffix(path.suffix + ".new")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w") as output:
        json.dump(value, output, indent=2)
        output.write("\n")
    temporary.replace(path)


def render(directory: Path, mas_id: str, tools_port: int) -> None:
    if mas_id:
        uuid.UUID(mas_id)
    if not 1 <= tools_port <= 65535:
        raise ValueError("NOA_TOOLS_PORT must be between 1 and 65535")
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    # Do not change routes underneath an active NOA workflow.
    with (directory / "noa.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("Source NOA proxy mode is running; stop it before reconfiguring infrastructure") from None
        token_path = directory / "tool-token"
        if not token_path.exists():
            descriptor = os.open(token_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "w") as output:
                output.write(secrets.token_urlsafe(32))
        token = token_path.read_text().strip()
        if not token:
            raise ValueError("The local tool-service token is empty")

        routes = []
        http_routes = [{"match": {"path": "/healthz"}, "direct_response": {"status": 200}}]
        if mas_id:
            for agent, tools in AGENT_TOOLS.items():
                for tool in tools:
                    path = tool_path(agent, tool)
                    routes.append({
                        "path": path,
                        "upstream_cluster": "noa_tools",
                        "allow_insecure_local": True,
                        "mas_id": mas_id,
                        "source_agent_id": agent,
                        "destination_agent_id": tool,
                        "protocol": "http",
                        "item_kind": "tool_call",
                        "operating_model": "black-box",
                    })
                    http_routes.append({
                        "match": {"path": path, "headers": [{"name": ":method", "string_match": {"exact": "POST"}}]},
                        "route": {"cluster": "noa_tools", "timeout": "0s", "retry_policy": {"num_retries": 0}},
                    })
        # The deployment example forwards unmatched paths; this local gateway must not.
        http_routes.append({"match": {"prefix": "/"}, "direct_response": {"status": 403}})
        filters = []
        if mas_id:
            filters.extend([
                {"name": "envoy.filters.http.wasm", "typed_config": {
                    "@type": "type.googleapis.com/envoy.extensions.filters.http.wasm.v3.Wasm",
                    "config": {"name": "ioc.traceparent", "root_id": "ioc_traceparent", "vm_config": {
                        "vm_id": "ioc_traceparent_vm", "runtime": "envoy.wasm.runtime.v8",
                        "code": {"local": {"filename": "/etc/sidecar/wasm/ioc_traceparent.wasm"}},
                    }},
                }},
                {"name": "envoy.filters.http.golang", "typed_config": {
                    "@type": "type.googleapis.com/envoy.extensions.filters.http.golang.v3alpha.Config",
                    "library_id": "ioc-sidecar-core", "library_path": "/etc/sidecar/plugins/ioc_sidecar_core.so",
                    "plugin_name": "ioc_sidecar_core", "plugin_config": {
                        "@type": "type.googleapis.com/google.protobuf.StringValue",
                        "value": json.dumps({"spec_path": "/etc/sidecar/sidecar-spec.yaml", "direction": "inbound"}),
                    },
                }},
            ])
        filters.append({"name": "envoy.filters.http.router", "typed_config": {
            "@type": "type.googleapis.com/envoy.extensions.filters.http.router.v3.Router",
        }})
        envoy = {
            "static_resources": {
                "listeners": [{
                    "name": "noa_tools_enforcement", "address": {"socket_address": {"address": "0.0.0.0", "port_value": 18080}},
                    "filter_chains": [{"filters": [{
                        "name": "envoy.filters.network.http_connection_manager", "typed_config": {
                            "@type": "type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager",
                            "stat_prefix": "noa_tools", "normalize_path": True,
                            "route_config": {"name": "noa_tools", "virtual_hosts": [{
                                "name": "noa_tools", "domains": ["*"], "routes": http_routes,
                                "request_headers_to_add": [{"header": {"key": "x-noa-tool-token", "value": token},
                                                            "append_action": "OVERWRITE_IF_EXISTS_OR_ADD"}],
                            }]},
                            "http_filters": filters,
                        },
                    }]}],
                }],
                "clusters": [{
                    "name": "noa_tools", "connect_timeout": "2s", "type": "LOGICAL_DNS", "lb_policy": "ROUND_ROBIN",
                    # Docker Desktop can return an IPv6 host address without a usable IPv6 route.
                    "dns_lookup_family": "V4_ONLY",
                    "load_assignment": {"cluster_name": "noa_tools", "endpoints": [{"lb_endpoints": [{"endpoint": {
                        "address": {"socket_address": {"address": "host.docker.internal", "port_value": tools_port}},
                    }}]}]},
                }],
            },
        }
        # Do not expose config_dump: it would disclose the private header used
        # for the host tool-service hop. /healthz supplies local readiness.
        write_json(directory / "sidecar-spec.json", {"mediation": {"inbound": {"routes": routes}, "outbound": {"routes": []}}})
        write_json(directory / "envoy.json", envoy)
        write_json(directory / "state.json", {"mas_id": mas_id, "tools_port": tools_port})
    print(f"Local proxy: generated {len(routes)} tool routes in {directory}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", required=True, type=Path)
    parser.add_argument("--mas-id", default="")
    parser.add_argument("--tools-port", type=int, default=8126)
    args = parser.parse_args()
    render(args.directory, args.mas_id, args.tools_port)


if __name__ == "__main__":
    main()

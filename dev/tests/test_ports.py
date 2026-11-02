"""Real socket regressions for macOS wildcard reuse and IPv6-only listeners."""

import importlib.util
from pathlib import Path
import socket
import unittest


spec = importlib.util.spec_from_file_location("check_ports", Path(__file__).resolve().parents[1] / "check_ports.py")
check_ports = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check_ports)


class PortProbeTests(unittest.TestCase):
    def listener(self, family, address, ipv6_only=None):
        try:
            listener = socket.socket(family, socket.SOCK_STREAM)
            self.addCleanup(listener.close)
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            if ipv6_only is not None:
                listener.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, int(ipv6_only))
            listener.bind((address, 0))
            listener.listen(4)
            return listener
        except OSError as exc:
            if family == socket.AF_INET6 and exc.errno in (
                check_ports.errno.EAFNOSUPPORT, check_ports.errno.EADDRNOTAVAIL,
                check_ports.errno.EPROTONOSUPPORT,
            ):
                self.skipTest("IPv6 is unavailable")
            raise

    def test_detects_reusable_ipv4_loopback_listener(self):
        server = self.listener(socket.AF_INET, "127.0.0.1")
        with self.assertRaisesRegex(check_ports.PortCheckError, "in use"):
            check_ports.require_ports_free([server.getsockname()[1]])

    def test_detects_ipv4_wildcard_listener(self):
        server = self.listener(socket.AF_INET, "0.0.0.0")
        with self.assertRaisesRegex(check_ports.PortCheckError, "in use"):
            check_ports.require_ports_free([server.getsockname()[1]])

    def test_detects_ipv6_only_loopback_listener(self):
        server = self.listener(socket.AF_INET6, "::1", True)
        with self.assertRaisesRegex(check_ports.PortCheckError, "in use on ::1"):
            check_ports.require_ports_free([server.getsockname()[1]])

    def test_detects_ipv6_only_wildcard_listener(self):
        server = self.listener(socket.AF_INET6, "::", True)
        with self.assertRaisesRegex(check_ports.PortCheckError, "in use on ::1"):
            check_ports.require_ports_free([server.getsockname()[1]])

    def test_detects_dual_stack_listener(self):
        server = self.listener(socket.AF_INET6, "::", False)
        with self.assertRaisesRegex(check_ports.PortCheckError, "in use"):
            check_ports.require_ports_free([server.getsockname()[1]])

    def test_accepts_port_after_listener_closed(self):
        server = self.listener(socket.AF_INET, "127.0.0.1")
        port = server.getsockname()[1]
        server.close()
        check_ports.require_ports_free([port])

    def test_accepts_recently_used_port_after_tcp_connection_closed(self):
        server = self.listener(socket.AF_INET, "127.0.0.1")
        port = server.getsockname()[1]
        with socket.create_connection(("127.0.0.1", port)) as client:
            peer, _ = server.accept()
            peer.close()
            self.assertEqual(client.recv(1), b"")
        server.close()
        check_ports.require_ports_free([port])

    def test_rejects_invalid_bind_override(self):
        for host in ("invalid-host", "172.17.0.1"):
            with self.subTest(host=host):
                with self.assertRaisesRegex(check_ports.PortCheckError, "127.0.0.1 or 0.0.0.0"):
                    check_ports.require_ports_free([], host)


if __name__ == "__main__":
    unittest.main()

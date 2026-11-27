# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

import noa_trip_planner.observability as observability


def test_initialize_observe_enables_instrumentation_once(monkeypatch) -> None:
    observe_calls = []
    a2a_instrument_calls = []
    mcp_instrument_calls = []

    class FakeA2AInstrumentor:
        is_instrumented_by_opentelemetry = False

        def instrument(self) -> None:
            a2a_instrument_calls.append(True)

    class FakeMcpInstrumentor:
        is_instrumented_by_opentelemetry = False

        def instrument(self) -> None:
            mcp_instrument_calls.append(True)

    monkeypatch.setenv("OTLP_HTTP_ENDPOINT", "http://collector:4318")
    monkeypatch.setattr(observability, "_initialized_applications", set())
    monkeypatch.setattr(observability, "_a2a_instrumented", False)
    monkeypatch.setattr(observability, "_mcp_instrumented", False)
    monkeypatch.setattr(
        observability.Observe,
        "init",
        lambda application_id, api_endpoint: observe_calls.append(
            (application_id, api_endpoint)
        ),
    )
    monkeypatch.setattr(observability, "A2AInstrumentor", FakeA2AInstrumentor)
    monkeypatch.setattr(observability, "McpInstrumentor", FakeMcpInstrumentor)

    assert observability.initialize_observe("test-app") is True
    assert observability.initialize_observe("test-app") is True

    assert observe_calls == [("test-app", "http://collector:4318")]
    assert a2a_instrument_calls == [True]
    assert mcp_instrument_calls == [True]

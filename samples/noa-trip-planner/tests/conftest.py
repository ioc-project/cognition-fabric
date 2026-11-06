"""Keep sample regression checks independent of real credentials and services."""

import os

import pytest


# The application creates model clients during import. Never load the developer's
# .env or allow a test to make a billable call with ambient credentials.
os.environ["PYTHON_DOTENV_DISABLED"] = "true"
os.environ["OPENAI_API_KEY"] = "test-key"
os.environ["AI_GATEWAY_API_KEY"] = "test-key"
os.environ["AI_GATEWAY_BASE_URL"] = "http://127.0.0.1:1/v1"
os.environ["NOA_MAS_ID"] = "e2d10a28-287c-4ab5-b927-25db80c5689a"
os.environ["NOA_ENABLE_SIMULATED_DELAY"] = "false"
os.environ.pop("OTLP_HTTP_ENDPOINT", None)
for key in ("IOA_OBSERVE", "IOA_OBSERVE_BASE_URL", "OBSERVE_HEADERS"):
    os.environ.pop(key, None)
os.environ["OBSERVE_TRACING_ENABLED"] = "true"


@pytest.fixture(scope="session", autouse=True)
def observe_exporter():
    from ioa_observe.sdk import Observe
    from ioa_observe.sdk.instruments import Instruments
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

    exporter = InMemorySpanExporter()
    Observe.init(
        os.environ["NOA_MAS_ID"],
        exporter=exporter,
        disable_batch=True,
        telemetry_enabled=False,
        realtime_observability_enabled=False,
        block_instruments=set(Instruments),
    )
    return exporter


@pytest.fixture
def spans(observe_exporter):
    from opentelemetry import context

    observe_exporter.clear()
    token = context.attach(context.set_value("session.id", "test-session"))
    try:
        yield observe_exporter
    finally:
        context.detach(token)

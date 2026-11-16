# Copyright 2026 Cisco Systems, Inc. and its affiliates
# SPDX-License-Identifier: Apache-2.0

"""CF-owned instants: aware in Python, UTC RFC 3339 on the wire."""

from datetime import datetime, timezone
from typing import Annotated

from pydantic import AfterValidator, AwareDatetime, PlainSerializer, WithJsonSchema


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("CF timestamps must include a timezone")
    return value.astimezone(timezone.utc)


def format_utc(value: datetime) -> str:
    return as_utc(value).isoformat().replace("+00:00", "Z")


UtcDateTime = Annotated[
    AwareDatetime,
    AfterValidator(as_utc),
    PlainSerializer(format_utc, return_type=str, when_used="json"),
    WithJsonSchema({"type": "string", "format": "date-time"}, mode="serialization"),
]

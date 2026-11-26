# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Utilities for simulating long-running agent and tool executions."""

import logging
import os
import random
import time

logger = logging.getLogger(__name__)


def _is_enabled() -> bool:
    """Return True when simulated delay is enabled via environment variable."""
    value = os.getenv("NOA_ENABLE_SIMULATED_DELAY", "false").strip().lower()
    return value in {"1", "true", "yes", "on"}


def _float_env(var_name: str, default: float) -> float:
    """Parse an environment variable as float with a safe fallback."""
    raw = os.getenv(var_name)
    if raw is None:
        return default

    try:
        return float(raw)
    except ValueError:
        logger.warning("Invalid float for %s=%r; using %s", var_name, raw, default)
        return default


def _resolve_delay_seconds(component: str, step_name: str | None = None) -> float:
    """Resolve delay from global, component, and optional step-specific env vars."""
    global_delay = _float_env("NOA_DELAY_SECONDS", 0.0)

    if component == "agent":
        component_delay = _float_env("NOA_DELAY_AGENT_SECONDS", global_delay)
        if step_name:
            step_key = step_name.upper().replace("-", "_")
            return _float_env(f"NOA_DELAY_AGENT_{step_key}_SECONDS", component_delay)
        return component_delay

    if component == "moderator":
        return _float_env("NOA_DELAY_MODERATOR_SECONDS", global_delay)

    if component == "tool":
        component_delay = _float_env("NOA_DELAY_TOOL_SECONDS", global_delay)
        if step_name:
            step_key = step_name.upper().replace("-", "_")
            return _float_env(f"NOA_DELAY_TOOL_{step_key}_SECONDS", component_delay)
        return component_delay

    return global_delay


def apply_simulated_delay(component: str, step_name: str | None = None) -> None:
    """Sleep for a configurable duration to simulate long-running operations."""
    if not _is_enabled():
        return

    base_delay = _resolve_delay_seconds(component=component, step_name=step_name)
    jitter = max(0.0, _float_env("NOA_DELAY_JITTER_SECONDS", 0.0))

    delay_seconds = max(0.0, base_delay) + (
        random.uniform(0, jitter) if jitter else 0.0
    )

    if delay_seconds <= 0:
        return

    label = step_name if step_name else component
    logger.info("Applying simulated delay of %.2fs for %s", delay_seconds, label)
    time.sleep(delay_seconds)

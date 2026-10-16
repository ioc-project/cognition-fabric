# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Cognition Engine Monitor - Background service that probes engine health through cfn-svc"""

import asyncio
import logging
import os
import time

from server.services.cfn_ce_probe import probe_ce_health
from server.services.cognition_engine import cognition_engine_service

logger = logging.getLogger(__name__)

# Default values for CE monitoring
# - CE_PROBE_INTERVAL_SECONDS: How often every enabled CE is probed (default: 2s)
# - CE_PROBE_TIMEOUT_SECONDS: Time cfn-svc waits for a CE to answer its health_url (default: 1s)
# - CE_OFFLINE_THRESHOLD_SECONDS: Mark an online CE offline after this long without a successful probe
#   (default: 6s). Keep it at least 3 x the probe interval so one missed probe does not flip a CE.
DEFAULT_PROBE_INTERVAL_SECONDS = 2
DEFAULT_PROBE_TIMEOUT_SECONDS = 1
DEFAULT_OFFLINE_THRESHOLD_SECONDS = 6


class CognitionEngineMonitor:
    """Background monitor for Cognition Engine status"""

    def __init__(
        self,
        probe_interval_seconds: float = None,
        probe_timeout_seconds: float = None,
        offline_threshold_seconds: float = None,
    ):
        """
        Initialize Cognition Engine Monitor

        Args:
            probe_interval_seconds: How often to probe each engine.
                                    Defaults to CE_PROBE_INTERVAL_SECONDS env var or 2s.
            probe_timeout_seconds: Time cfn-svc waits for an engine to answer.
                                   Defaults to CE_PROBE_TIMEOUT_SECONDS env var or 1s.
            offline_threshold_seconds: Seconds since the last successful probe to mark offline.
                                       Defaults to CE_OFFLINE_THRESHOLD_SECONDS env var or 6s.
        """
        self.probe_interval = (
            probe_interval_seconds
            if probe_interval_seconds is not None
            else float(os.getenv("CE_PROBE_INTERVAL_SECONDS", DEFAULT_PROBE_INTERVAL_SECONDS))
        )
        self.probe_timeout = (
            probe_timeout_seconds
            if probe_timeout_seconds is not None
            else float(os.getenv("CE_PROBE_TIMEOUT_SECONDS", DEFAULT_PROBE_TIMEOUT_SECONDS))
        )
        self.offline_threshold = (
            offline_threshold_seconds
            if offline_threshold_seconds is not None
            else float(os.getenv("CE_OFFLINE_THRESHOLD_SECONDS", DEFAULT_OFFLINE_THRESHOLD_SECONDS))
        )
        self.running = False
        logger.info(
            f"Cognition Engine Monitor initialized (probe_interval={self.probe_interval}s, "
            f"probe_timeout={self.probe_timeout}s, offline_threshold={self.offline_threshold}s)"
        )

    async def probe_all(self) -> None:
        """Probe every enabled CE once, concurrently, and record the results."""
        try:
            ce_ids = await asyncio.to_thread(cognition_engine_service.list_probe_targets)
        except Exception as e:
            # Could not read the engines: skip this tick
            logger.error(f"Failed to list Cognition Engines to probe: {e}")
            return

        results = await asyncio.gather(*(self._probe_one(ce_id) for ce_id in ce_ids), return_exceptions=True)
        for ce_id, result in zip(ce_ids, results):
            if isinstance(result, Exception):
                logger.error(f"Error probing Cognition Engine {ce_id}: {result}", exc_info=result)

    async def _probe_one(self, ce_id: str) -> None:
        healthy = await asyncio.to_thread(probe_ce_health, ce_id, self.probe_timeout)
        new_status = await asyncio.to_thread(
            cognition_engine_service.record_probe_result, ce_id, healthy, self.offline_threshold
        )
        if new_status:
            logger.info(f"Cognition Engine {ce_id} is now {new_status}")

    async def start(self):
        """Start the background probe loop"""
        self.running = True
        logger.info("Starting Cognition Engine monitor")

        while self.running:
            started = time.monotonic()
            try:
                await self.probe_all()
            except Exception as e:
                logger.error(f"Error in Cognition Engine monitor: {e}", exc_info=True)

            await asyncio.sleep(max(0.0, self.probe_interval - (time.monotonic() - started)))

        logger.info("Cognition Engine monitor stopped")

    def stop(self):
        """Stop the background probe loop"""
        self.running = False
        logger.info("Stopping Cognition Engine monitor")


# Global instance
cognition_engine_monitor = CognitionEngineMonitor()

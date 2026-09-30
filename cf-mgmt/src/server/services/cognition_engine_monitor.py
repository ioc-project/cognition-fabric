# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Cognition Engine Monitor - Background service for monitoring engine heartbeats"""

import asyncio
import logging
import os

from server.services.cognition_engine import cognition_engine_service

logger = logging.getLogger(__name__)

# Default values for CE monitoring
# - CE_MONITOR_CHECK_INTERVAL_SECONDS: How often the monitor checks for stale CEs (default: 1s)
# - CE_OFFLINE_THRESHOLD_SECONDS: Mark CE offline after this many seconds without heartbeat (default: 15s)
#
# These should be coordinated with the CE heartbeat interval:
# - CE heartbeat interval should be < offline_threshold / 3 (e.g., 5s heartbeat with 15s threshold)
DEFAULT_CHECK_INTERVAL_SECONDS = 1
DEFAULT_OFFLINE_THRESHOLD_SECONDS = 15


class CognitionEngineMonitor:
    """Background monitor for Cognition Engine status"""

    def __init__(self, check_interval_seconds: int = None, offline_threshold_seconds: int = None):
        """
        Initialize Cognition Engine Monitor

        Args:
            check_interval_seconds: How often to check for stale engines.
                                    Defaults to CE_MONITOR_CHECK_INTERVAL_SECONDS env var or 5s.
            offline_threshold_seconds: Seconds since last heartbeat to mark offline.
                                       Defaults to CE_OFFLINE_THRESHOLD_SECONDS env var or 15s.
        """
        self.check_interval = check_interval_seconds or int(
            os.getenv("CE_MONITOR_CHECK_INTERVAL_SECONDS", DEFAULT_CHECK_INTERVAL_SECONDS)
        )
        self.offline_threshold = offline_threshold_seconds or int(
            os.getenv("CE_OFFLINE_THRESHOLD_SECONDS", DEFAULT_OFFLINE_THRESHOLD_SECONDS)
        )
        self.running = False
        logger.info(
            f"Cognition Engine Monitor initialized (check_interval={self.check_interval}s, "
            f"offline_threshold={self.offline_threshold}s)"
        )

    async def start(self):
        """Start the background monitoring loop"""
        self.running = True
        logger.info("Starting Cognition Engine monitor")

        while self.running:
            try:
                count = cognition_engine_service.mark_stale_engines_offline(self.offline_threshold)
                if count > 0:
                    logger.info(f"Marked {count} Cognition Engine(s) as offline")
            except Exception as e:
                logger.error(f"Error in Cognition Engine monitor: {e}", exc_info=True)

            await asyncio.sleep(self.check_interval)

        logger.info("Cognition Engine monitor stopped")

    def stop(self):
        """Stop the background monitoring loop"""
        self.running = False
        logger.info("Stopping Cognition Engine monitor")


# Global instance
cognition_engine_monitor = CognitionEngineMonitor()

#!/usr/bin/env python3
# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""
Reward Annotator - Write session reward annotations directly to ClickHouse.

This module provides functionality to annotate sessions with reward values (0 or 1)
by writing directly to the ClickHouse `derived_metrics` table.

Usage:
    from reward_annotator import RewardAnnotator

    annotator = RewardAnnotator()
    annotator.annotate_session(
        session_id="your-session-id",
        reward=1,
        span_id="any-span-id",
        trace_id="any-trace-id"
    )
"""

import json
import logging
import os
import uuid
from datetime import datetime
from typing import Optional

import requests


logger = logging.getLogger(__name__)


class RewardAnnotator:
    """Writes reward annotations directly to ClickHouse derived_metrics table."""

    def __init__(
        self,
        host: Optional[str] = None,
        port: Optional[int] = None,
        user: Optional[str] = None,
        password: Optional[str] = None,
        database: Optional[str] = None,
        app_name: Optional[str] = None,
        app_id: Optional[str] = None,
    ):
        """
        Initialize the RewardAnnotator.

        Args:
            host: ClickHouse host (default: from CLICKHOUSE_URL env or 'localhost')
            port: ClickHouse HTTP port (default: from CLICKHOUSE_PORT env or 8123)
            user: ClickHouse user (default: from CLICKHOUSE_USER env or 'admin')
            password: ClickHouse password (default: from CLICKHOUSE_PASS env or 'admin')
            database: ClickHouse database (default: from CLICKHOUSE_DB env or 'default')
            app_name: Application name for metrics (default: 'noa-trip-planner')
            app_id: Application ID for metrics (default: 'noa-trip-planner-mas')
        """
        self.host = host or os.getenv("CLICKHOUSE_URL", "localhost")
        self.port = port or int(os.getenv("CLICKHOUSE_PORT", "8123"))
        self.user = user or os.getenv("CLICKHOUSE_USER", "admin")
        self.password = password or os.getenv("CLICKHOUSE_PASS", "admin")
        self.database = database or os.getenv("CLICKHOUSE_DB", "default")
        self.app_name = app_name or "noa-trip-planner"
        self.app_id = app_id or "noa-trip-planner-mas"

        self._base_url = f"http://{self.host}:{self.port}"
        self._table_verified = False  # Cache to avoid repeated table checks

    def _execute_query(self, query: str) -> requests.Response:
        """Execute a query against ClickHouse."""
        url = f"{self._base_url}/?user={self.user}&password={self.password}&database={self.database}"
        headers = {"Content-Type": "text/plain"}
        response = requests.post(url, data=query, headers=headers)
        response.raise_for_status()
        return response

    def _table_exists(self) -> bool:
        """Check if the derived_metrics table exists."""
        try:
            response = self._execute_query("EXISTS TABLE derived_metrics")
            return response.text.strip() == "1"
        except requests.RequestException:
            return False

    def ensure_table_exists(self) -> bool:
        """
        Ensure the derived_metrics table exists.

        Returns:
            True if table exists or was created successfully
        """
        # Skip if already verified in this session
        if self._table_verified:
            return True

        # Check if table already exists
        if self._table_exists():
            self._table_verified = True
            return True

        # Create the table if it doesn't exist
        create_table_query = """
        CREATE TABLE IF NOT EXISTS derived_metrics (
            ID String,
            SpanId String,
            TraceId String,
            SessionId String,
            Timestamp DateTime64(9),
            Metrics String,
            AppName String,
            AppId String,
            Scope String
        ) ENGINE = MergeTree()
        ORDER BY (SessionId, Timestamp)
        """
        try:
            self._execute_query(create_table_query)
            self._table_verified = True
            return True
        except requests.RequestException as e:
            logger.error("❌ Failed to create table: %s", e)
            return False

    def annotate_session(
        self,
        session_id: str,
        reward: int,
        span_id: Optional[str] = None,
        trace_id: Optional[str] = None,
        additional_metrics: Optional[dict] = None,
    ) -> bool:
        """
        Write a reward annotation for a session to ClickHouse.

        Args:
            session_id: The session ID to annotate
            reward: The reward value (0 or 1)
            span_id: Optional span ID (generates UUID if not provided)
            trace_id: Optional trace ID (generates UUID if not provided)
            additional_metrics: Optional dict of additional metrics to include

        Returns:
            True if annotation was written successfully
        """
        # Ensure table exists (auto-create if needed)
        self.ensure_table_exists()

        # Validate reward value
        if reward not in (0, 1):
            logger.warning("⚠️ reward should be 0 or 1, got %s", reward)

        # Generate IDs if not provided
        record_id = str(uuid.uuid4())
        span_id = span_id or str(uuid.uuid4())
        trace_id = trace_id or str(uuid.uuid4())

        # Build metrics JSON
        metrics = {"reward": reward}
        if additional_metrics:
            metrics.update(additional_metrics)
        metrics_json = json.dumps(metrics)

        # Format timestamp for ClickHouse
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")

        # Build INSERT query
        insert_query = f"""
        INSERT INTO derived_metrics (ID, SpanId, TraceId, SessionId, Timestamp, Metrics, AppName, AppId, Scope)
        VALUES (
            '{record_id}',
            '{span_id}',
            '{trace_id}',
            '{session_id}',
            '{timestamp}',
            '{metrics_json}',
            '{self.app_name}',
            '{self.app_id}',
            'session'
        )
        """

        try:
            self._execute_query(insert_query)
            logger.info("✅ Annotated session '%s' with reward=%s", session_id, reward)
            return True
        except requests.RequestException as e:
            logger.error("❌ Failed to annotate session: %s", e)
            return False

    def get_session_reward(self, session_id: str) -> Optional[int]:
        """
        Get the reward annotation for a session.

        Args:
            session_id: The session ID to look up

        Returns:
            The reward value (0 or 1) or None if not found
        """
        query = f"""
        SELECT Metrics
        FROM derived_metrics
        WHERE SessionId LIKE '%{session_id}%'
          AND Scope = 'session'
        ORDER BY Timestamp DESC
        LIMIT 1
        FORMAT JSONEachRow
        """

        try:
            response = self._execute_query(query)
            if response.text.strip():
                result = json.loads(response.text.strip())
                metrics = json.loads(result.get("Metrics", "{}"))
                return metrics.get("reward")
        except (requests.RequestException, json.JSONDecodeError) as e:
            logger.error("❌ Failed to get session reward: %s", e)

        return None

    def list_annotated_sessions(self, limit: int = 20) -> list:
        """
        List recently annotated sessions.

        Args:
            limit: Maximum number of sessions to return

        Returns:
            List of dicts with session_id, reward, and timestamp
        """
        query = f"""
        SELECT SessionId, Metrics, Timestamp
        FROM derived_metrics
        WHERE Scope = 'session'
        ORDER BY Timestamp DESC
        LIMIT {limit}
        FORMAT JSONEachRow
        """

        try:
            response = self._execute_query(query)
            results = []
            for line in response.text.strip().split("\n"):
                if line.strip():
                    row = json.loads(line)
                    metrics = json.loads(row.get("Metrics", "{}"))
                    results.append({
                        "session_id": row.get("SessionId"),
                        "reward": metrics.get("reward"),
                        "timestamp": row.get("Timestamp"),
                    })
            return results
        except (requests.RequestException, json.JSONDecodeError) as e:
            logger.error("❌ Failed to list sessions: %s", e)
            return []


def prompt_for_reward() -> Optional[int]:
    """
    Prompt the user for a reward value.

    Returns:
        0, 1, or None if skipped
    """
    logger.info("\n" + "=" * 60)
    logger.info("📊 REWARD ANNOTATION")
    logger.info("=" * 60)
    logger.info("Rate the agent's response:")
    logger.info("  [1] ✅ Good - Agent performed correctly")
    logger.info("  [0] ❌ Bad  - Agent made mistakes")
    logger.info("  [s] ⏭️  Skip - Don't annotate this session")
    logger.info("-" * 60)

    while True:
        try:
            choice = input("Enter your rating (1/0/s): ").strip().lower()
            if choice == "1":
                return 1
            elif choice == "0":
                return 0
            elif choice == "s":
                logger.info("⏭️  Skipping annotation")
                return None
            else:
                logger.info("Invalid input. Please enter 1, 0, or s")
        except (EOFError, KeyboardInterrupt):
            logger.info("\n⏭️  Annotation cancelled")
            return None


# CLI for testing
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Reward Annotator CLI")
    parser.add_argument("--host", default=None, help="ClickHouse host")
    parser.add_argument("--port", type=int, default=None, help="ClickHouse port")
    parser.add_argument("--list", action="store_true", help="List annotated sessions")
    parser.add_argument("--annotate", metavar="SESSION_ID", help="Annotate a session")
    parser.add_argument("--reward", type=int, choices=[0, 1], help="Reward value (0 or 1)")
    parser.add_argument("--get", metavar="SESSION_ID", help="Get reward for a session")
    parser.add_argument("--create-table", action="store_true", help="Create derived_metrics table")

    args = parser.parse_args()

    annotator = RewardAnnotator(host=args.host, port=args.port)

    if args.create_table:
        if annotator.ensure_table_exists():
            logger.info("✅ Table 'derived_metrics' exists or was created")
        else:
            logger.error("❌ Failed to create table")

    elif args.list:
        logger.info("\n📋 Recently Annotated Sessions:\n")
        sessions = annotator.list_annotated_sessions()
        if sessions:
            logger.info(f"{'Session ID':<60} {'Reward':>8} {'Timestamp':<25}")
            logger.info("-" * 95)
            for s in sessions:
                logger.info(f"{s['session_id']:<60} {s['reward']:>8} {s['timestamp']:<25}")
        else:
            logger.info("No annotated sessions found.")

    elif args.annotate:
        if args.reward is None:
            reward = prompt_for_reward()
            if reward is not None:
                annotator.annotate_session(args.annotate, reward)
        else:
            annotator.annotate_session(args.annotate, args.reward)

    elif args.get:
        reward = annotator.get_session_reward(args.get)
        if reward is not None:
            logger.info(f"Session '{args.get}' has reward: {reward}")
        else:
            logger.info(f"No reward annotation found for session '{args.get}'")

    else:
        parser.print_help()

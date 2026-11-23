#!/bin/sh

# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

set -eu

sleep "${OXP_INIT_DELAY_SECONDS:-5}"

attempt=1
while [ "$attempt" -le 30 ]; do
    if [ "$(clickhouse-client \
        --host "$CLICKHOUSE_HOST" \
        --port "$CLICKHOUSE_NATIVE_PORT" \
        --user "$CLICKHOUSE_USERNAME" \
        --password "$CLICKHOUSE_PASSWORD" \
        --query "EXISTS TABLE default.otel_traces" 2>/dev/null || true)" = "1" ]; then
        break
    fi

    if [ "$attempt" -eq 30 ]; then
        echo "Timed out waiting for default.otel_traces" >&2
        exit 1
    fi

    attempt=$((attempt + 1))
    sleep 2
done

clickhouse-client \
    --host "$CLICKHOUSE_HOST" \
    --port "$CLICKHOUSE_NATIVE_PORT" \
    --user "$CLICKHOUSE_USERNAME" \
    --password "$CLICKHOUSE_PASSWORD" \
    --multiquery \
    < /scripts/init-oxp-clickhouse.sql

echo "ClickHouse-to-RabbitMQ bridge initialized"
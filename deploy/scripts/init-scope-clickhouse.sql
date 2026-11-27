-- Copyright 2026 Cisco Systems, Inc. and its affiliates
--
-- SPDX-License-Identifier: Apache-2.0

-- The upstream SCOPE worker still uses the claris exchange.
ALTER TABLE default.otel_traces
    ADD COLUMN IF NOT EXISTS session_id String MATERIALIZED
        multiIf(
            position(SpanAttributes['session.id'], '_') > 0,
            substring(
                SpanAttributes['session.id'],
                position(SpanAttributes['session.id'], '_') + 1
            ),
            SpanAttributes['session.id']
        );

ALTER TABLE default.otel_traces
    ADD COLUMN IF NOT EXISTS application_id String MATERIALIZED
        SpanAttributes['application_id'];

ALTER TABLE default.otel_traces
    ADD COLUMN IF NOT EXISTS agent_id String MATERIALIZED
        SpanAttributes['agent_id'];

CREATE TABLE IF NOT EXISTS default.otel_traces_end_rmq
(
    session_id String
)
ENGINE = RabbitMQ
SETTINGS
    rabbitmq_host_port = 'rabbitmq:5672',
    rabbitmq_vhost = '/',
    rabbitmq_exchange_name = 'claris',
    rabbitmq_exchange_type = 'direct',
    rabbitmq_routing_key_list = 'new_session_in',
    rabbitmq_format = 'JSONEachRow',
    rabbitmq_persistent = 1;

CREATE MATERIALIZED VIEW IF NOT EXISTS default.mv_otel_traces_end
TO default.otel_traces_end_rmq
AS
SELECT session_id
FROM default.otel_traces
WHERE SpanName = 'session.end';
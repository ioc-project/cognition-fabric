#!/bin/sh
set -eu

attempt=1
while [ "$attempt" -le 30 ]; do
    if rabbitmqadmin \
        -H "$RABBITMQ_HOST" \
        -P "$RABBITMQ_MANAGEMENT_PORT" \
        -u "$RABBITMQ_USER" \
        -p "$RABBITMQ_PASSWORD" \
        list queues name 2>/dev/null | grep -q 'new_session_in'; then
        break
    fi

    if [ "$attempt" -eq 30 ]; then
        echo "Timed out waiting for RabbitMQ queue new_session_in" >&2
        exit 1
    fi

    attempt=$((attempt + 1))
    sleep 2
done

rabbitmqadmin \
    -H "$RABBITMQ_HOST" \
    -P "$RABBITMQ_MANAGEMENT_PORT" \
    -u "$RABBITMQ_USER" \
    -p "$RABBITMQ_PASSWORD" \
    declare binding \
    source=claris \
    destination_type=queue \
    destination=new_session_in \
    routing_key=new_session_in

echo "RabbitMQ bridge binding initialized"
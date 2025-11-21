#!/bin/sh
set -e

exec "$@"

echo "Starting Next.js server with runtime configuration..."
echo "API_URL: ${NEXT_PUBLIC_API_URL}"
echo "LOG_LEVEL: ${NEXT_PUBLIC_LOG_LEVEL}"
echo "AUTH_PROVIDER: ${NEXT_PUBLIC_AUTH_PROVIDER}"

# Execute the command passed to the container
exec "$@"

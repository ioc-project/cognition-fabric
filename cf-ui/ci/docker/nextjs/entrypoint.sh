#!/bin/sh
set -e

echo "Starting Next.js server with runtime configuration..."
echo "CSP_UI_API_BASE_URL: ${CSP_UI_API_BASE_URL}"

# Execute the command passed to the container
exec "$@"

# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

#!/bin/sh
set -e

echo "Starting Next.js server with runtime configuration..."
echo "CFN_UI_API_BASE_URL: ${CFN_UI_API_BASE_URL}"
echo "NEXT_PUBLIC_CFN_UI_API_BASE_URL: ${NEXT_PUBLIC_CFN_UI_API_BASE_URL}"

if [ -z "$NEXTAUTH_SECRET" ]; then
  export NEXTAUTH_SECRET="secret"
fi
echo "NEXTAUTH_SECRET: set"

if [ -z "$NEXTAUTH_URL" ]; then
  export NEXTAUTH_URL="http://localhost:9001"
fi
echo "NEXTAUTH_URL: ${NEXTAUTH_URL}"

# Execute the command passed to the container
exec "$@"

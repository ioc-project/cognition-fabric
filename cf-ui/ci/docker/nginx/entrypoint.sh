# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

#!/bin/sh

envsubst '$VITE_APP_CLIENT_PORT $VITE_API_URL $VITE_IAM_PRODUCT_ID $VITE_APP_LOG_LEVEL $VITE_IAM_UI $VITE_IAM_API $VITE_IAM_OIDC_CLIENT_ID $VITE_IAM_OIDC_ISSUER $VITE_SEGMENT_ID $VITE_CCI_UI $VITE_CCI_OIDC_CLIENT_ID $VITE_CCI_OIDC_SCOPES $VITE_CCI_OIDC_ISSUER $VITE_AUTH_PROVIDER' < /home/web/nginx/nginx.env.conf > /home/web/nginx/nginx.conf
exec "$@"

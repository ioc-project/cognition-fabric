# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

FROM alpine:3.21.0 AS build

# Use Docker secrets to securely pass ARTIFACTORY_PASSWORD
# RUN --mount=type=secret,id=artifactory_password \
#   ARTIFACTORY_PASSWORD=$(cat /run/secrets/artifactory_password)

# Install packages
RUN apk add --update \
  libpng-dev \
  build-base \
  nodejs \
  npm \
  yarn

# Set workdir
WORKDIR /home/web

# Copy src
COPY . .

# Create env file if not exists
RUN touch .env && echo "ARTIFACTORY_PASSWORD=${ARTIFACTORY_PASSWORD}" >> .env

# Install libs
RUN yarn install || true
RUN yarn build

FROM alpine:3.21.0

# Install packages
RUN apk add --update \
  gettext \
  nginx

# Create a group and user
RUN addgroup -S web && adduser -S -G web -u 999 web

# Set workdir
WORKDIR /home/web

COPY --from=build /home/web/dist ./dist
COPY --chown=web:web ./ci/docker/nginx/entrypoint.sh .
COPY --chown=web:web ./ci/docker/nginx/nginx.conf ./nginx/nginx.env.conf
# COPY --chown=web:web ./ci/docker/nginx/csp-header.conf ./nginx/csp-header.conf
RUN mkdir ./nginx/logs && \
  mkdir ./nginx/tmp && \
  chown web:web ./nginx/logs && \
  chown web:web ./nginx/tmp

# Add SSI vars
RUN sed -i 's/<head>/<head>\<script nonce="111dd4a0-4c4e-43a9-8eb4-6446ad2e10c7" language="javascript"\>window.apiUrl=`\<!--#echo var="apiUrl"--\>`;window.logLevel=`\<!--#echo var="logLevel"--\>`;window.iamProductId=`\<!--#echo var="iamProductId"--\>`;window.iamUi=`\<!--#echo var="iamUi"--\>`;window.iamApi=`\<!--#echo var="iamApi"--\>`;window.iamOidcClientId=`\<!--#echo var="iamOidcClientId"--\>`;window.iamOidcScopes=`\<!--#echo var="iamOidcScopes"--\>`;window.iamOidcIssuer=`\<!--#echo var="iamOidcIssuer"--\>`;window.segmentId=`\<!--#echo var="segmentId"--\>`;window.cciUi=`\<!--#echo var="cciUi"--\>`;window.cciOidcClientId=`\<!--#echo var="cciOidcClientId"--\>`;window.cciOidcScopes=`\<!--#echo var="cciOidcScopes"--\>`;window.cciOidcIssuer=`\<!--#echo var="cciOidcIssuer"--\>`;window.authProvider=`\<!--#echo var="authProvider"--\>`;<\/script>/g' ./dist/index.html

# Set non root user
USER web

ENTRYPOINT ["./entrypoint.sh"]
CMD ["/usr/sbin/nginx", "-c", "/home/web/nginx/nginx.conf", "-g", "daemon off;pid /home/web/nginx/nginx.pid;", "-p", "/home/web/nginx"]

#!/bin/bash -e

# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

# Syntax build-docker.sh [-i|--image imagename]

UI_COMPONENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UI_REPOSITORY_DIR="$(cd "$UI_COMPONENT_DIR/.." && pwd)"

PROJECT=ioc-cfn-mgmt-plane-ui
DOCKER_IMAGE=${PROJECT}:latest

while [[ $# -gt 0 ]]
do
    key="${1}"

    case ${key} in
    -i|--image)
        DOCKER_IMAGE="${2}"
        shift;shift
        ;;
    -h|--help)
        less README.md
        exit 0
        ;;
    -c|--code-coverage)
        CODE_COVERAGE=cc
        shift
        ;;
    -s|--static-analysis)
        STATIC_ANALYSIS=sa
        shift
        ;;
    *) # unknown
        echo Unknown Parameter $1
        exit 4
    esac
done

echo BUILDING DOCKER ${DOCKER_IMAGE}
docker build --no-cache -t "$DOCKER_IMAGE" \
  -f "$UI_COMPONENT_DIR/ci/docker/Dockerfile.next" "$UI_REPOSITORY_DIR"

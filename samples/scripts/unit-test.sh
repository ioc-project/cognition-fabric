#!/bin/bash -e

# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

# Run Template CE unit tests
cd template-ce
uv pip install -e ".[test]"
uv run pytest -v
echo "UNIT-TEST DONE"
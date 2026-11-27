# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

SHELL := /bin/sh
.DEFAULT_GOAL := help

# enforcement=envoy|shadi adds a Proxy adapter; service=<name> narrows logs.
enforcement ?=
service ?=

export STACK_ENFORCEMENT := $(enforcement)
export STACK_SERVICE := $(service)

.PHONY: help up down status logs config pull doctor
help:
	@bash scripts/run-stack.sh --help

up:
	bash scripts/run-stack.sh up
down:
	bash scripts/run-stack.sh down
status:
	bash scripts/run-stack.sh status
logs:
	bash scripts/run-stack.sh logs
config:
	bash scripts/run-stack.sh config
pull:
	bash scripts/run-stack.sh pull
doctor:
	bash scripts/run-stack.sh doctor

SHELL := /bin/sh
.DEFAULT_GOAL := help

# Optional: profile=full-mas adds the NOA sample app; enforcement=envoy|shadi
# adds an enforcement flavor; service=<name> narrows logs.
profile ?=
enforcement ?=
service ?=

export STACK_PROFILE := $(profile)
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

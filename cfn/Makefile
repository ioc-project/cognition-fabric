PROJECT_NAME=cfn
GO_FILES=$(shell go list ./... | grep -v /vendor/)

GO_BUILD_ENV ?= CGO_ENABLED=0
BUILD_VERSION ?= latest
IMAGE_NAME ?= ghcr.io/cisco-eti/ioc-scale-cfn-svc
IMAGE_TAG ?= $(BUILD_VERSION)

.PHONY: build
build:
	docker build -t $(IMAGE_NAME):$(IMAGE_TAG) .

.PHONY: test
test:
	go test -cover -count=1 $(GO_FILES)

.PHONY: run
run:
	$(GO_BUILD_ENV) go run ./cmd/cfn

.PHONY: lint
lint:
	@if [ -n "$$(gofmt -l .)" ]; then \
		echo "Code is not formatted. Run 'make fmt' to fix."; \
		gofmt -d .; \
		exit 1; \
	fi
	go vet $(GO_FILES)

.PHONY: fmt
fmt:
	go fmt $(GO_FILES)

.PHONY: docs
docs:
	swag init --parseDependency --parseInternal --dir ./cmd/cfn,./pkg/app,./pkg/app/httpapi/cognitionengine --output ./docs/api

PROTOC ?= protoc
PROTO_FILES = api/proto/enforcement/v1/enforcement.proto api/proto/ce/v1/ce.proto
PROTO_MODULE = github.com/cisco-eti/ioc-scale-cfn-svc
NOA_PROTO_ROOT = deploy/local/noa-trip-planner/src
NOA_PROTO_FILE = $(NOA_PROTO_ROOT)/noa_trip_planner/generated/enforcement.proto

.PHONY: proto
proto:
	$(PROTOC) -I . --go_out=. --go_opt=module=$(PROTO_MODULE) \
		--go-grpc_out=. --go-grpc_opt=module=$(PROTO_MODULE) $(PROTO_FILES)
	cp api/proto/enforcement/v1/enforcement.proto $(NOA_PROTO_FILE)
	$(PROTOC) -I $(NOA_PROTO_ROOT) --python_out=$(NOA_PROTO_ROOT) $(NOA_PROTO_FILE)

.PHONY: proto-check
proto-check:
	@set -e; generated_dir=$$(mktemp -d); trap 'rm -rf "$$generated_dir"' EXIT; \
	$(PROTOC) -I . --go_out="$$generated_dir" --go_opt=module=$(PROTO_MODULE) \
		--go-grpc_out="$$generated_dir" --go-grpc_opt=module=$(PROTO_MODULE) $(PROTO_FILES); \
	find pkg/api -type f -name '*.pb.go' | LC_ALL=C sort > "$$generated_dir/current-files"; \
	(cd "$$generated_dir" && find pkg/api -type f -name '*.pb.go' | LC_ALL=C sort) > "$$generated_dir/generated-files"; \
	diff -u "$$generated_dir/current-files" "$$generated_dir/generated-files"; \
	while IFS= read -r generated_file; do \
		diff -u "$$generated_file" "$$generated_dir/$$generated_file"; \
	done < "$$generated_dir/generated-files"; \
	diff -u api/proto/enforcement/v1/enforcement.proto $(NOA_PROTO_FILE); \
	mkdir -p "$$generated_dir/noa"; \
	$(PROTOC) -I $(NOA_PROTO_ROOT) --python_out="$$generated_dir/noa" $(NOA_PROTO_FILE); \
	diff -u $(NOA_PROTO_ROOT)/noa_trip_planner/generated/enforcement_pb2.py \
		"$$generated_dir/noa/noa_trip_planner/generated/enforcement_pb2.py"

.PHONY: docs-check
docs-check: docs
	@if [ -n "$$(git diff docs/api)" ]; then \
		echo "API docs are out of date. Run 'make docs' and commit the changes."; \
		git diff docs/api; \
		exit 1; \
	fi

.PHONY: clean
clean:
	docker rmi $(IMAGE_NAME):$(IMAGE_TAG) 2>/dev/null || true

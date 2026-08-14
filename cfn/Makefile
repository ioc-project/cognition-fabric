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

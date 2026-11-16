GO ?= go
PYTHON ?= python3

.PHONY: test lint proto proto-check openapi-check
test:
	$(GO) test -count=1 ./...

lint:
	@test -z "$$(gofmt -l .)" || { gofmt -d .; exit 1; }
	$(GO) vet ./...

proto:
	$(PYTHON) tools/generate_proto.py
	cd ../samples/template-ce && uv run --frozen python scripts/generate_proto.py

proto-check:
	$(PYTHON) tools/generate_proto.py --check
	cd ../samples/template-ce && uv run --frozen python scripts/generate_proto.py --check

openapi-check:
	uv run --no-project --with openapi-spec-validator==0.7.2 python tools/check_openapi.py

---
title: Run Demo CE
---

# Run Demo CE

Run commands from the repository root unless a step says otherwise.

## Prerequisites

- Docker with Compose, or the Go version declared in `demo-ce/go.mod` for a native run.
- A GitHub token that can read the private CFN Go module when building the image.
- Reachable CFN and OXP services for the complete demonstration.
- The MAS and agent identities used by the request, copied into your config.

The [demo repository](https://github.com/cisco-eti/ioc-scaling-demos/tree/main/noa)
provides the surrounding NOA stack. This repository starts only the CE.

## Configure the MAS

Edit `demo-ce/config/config.json`. The bundled sample contains `mas-a` and `mas-b`;
replace those IDs and agent names with the values from your environment.

For manual onboarding, create the MAS in the management UI, register the Demo CE and associate
it with that MAS before sending application traffic. Keep these identifiers consistent with the JSON file.
The CE's startup registration alone does not replace onboarding the demo application.

## Start with Compose

Export `GITHUB_TOKEN` in your shell, then run:

```bash
docker compose up --build -d demo-ce
docker compose logs -f --no-log-prefix demo-ce
```

The token is supplied as a build secret to fetch the private module. It is not a runtime variable
inside the CE. The sample Compose environment points to CFN on host port `9002` and OXP on host
port `8000`, using `host.docker.internal`. Adjust those addresses for the stack you started.
The Go module binds gRPC to `18001`; Compose publishes that port.

## Check service status

The HTTP listener uses port `18000` inside the container. It is not published by the root Compose file.
Check it from inside the service:

```bash
docker compose exec demo-ce wget -S -O- http://localhost:18000/healthz
docker compose exec demo-ce wget -S -O- http://localhost:18000/readyz
```

`/healthz` returns 200 while the HTTP server is up. `/readyz` returns 200 after CFN registration;
it returns 503 while registration is pending. Configure the advertised address so CFN can reach
both gRPC and the health listener from its own network.

## Native Go run

```bash
cd demo-ce
CE_CONFIG_FILE=config/config.json \
  CFN_URL=http://localhost:9002 \
  OXP_API_URL=http://localhost:8000 \
  ADVERTISED_GRPC_ADDRESS=localhost:18001 \
  go run ./cmd/demo-ce
```

For a native run, `/healthz`, `/readyz` and `/info` are available at `http://localhost:18000`.
The gRPC server enables reflection. To inspect the service with `grpcurl`:

```bash
grpcurl -plaintext localhost:18001 list ioc.ce.v1.CognitionEngine
```

## Stop

```bash
docker compose down
```

Continue with the [evaluation flow](evaluation-flow.md) or [recording walkthrough](walkthrough.md).

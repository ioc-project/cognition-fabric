---
title: Troubleshoot Demo CE
---

# Troubleshoot Demo CE

| Symptom | Check |
|---|---|
| Private Go module cannot be downloaded | Export a GitHub token with read access before the Docker build |
| CE is alive but `/readyz` returns 503 | CFN registration is still pending; verify `CFN_URL` and network reachability |
| CFN lists the CE offline | CFN must reach the advertised HTTP address, not only the gRPC port |
| All requests get `MAS_SCOPE` | Match the request MAS ID to the per-MAS config or single-MAS file |
| Unexpected `DEFAULT_DENY` | Compare literal source/destination identities with the loaded rules |
| `MISSING_CONTEXT` with `RACE` | Required input was not visible before retry exhaustion or the deadline |
| `MISSING_CONTEXT` with `GAP` | Examine correlation, event kind, session/message references and required evidence |
| gRPC `Unavailable` after identity succeeds | Look for `store.read.failed` or `store.write.failed` |
| No new config effect | The config is read at startup; restart/recreate the CE |
| No colors | Check `NO_COLOR`, `LOG_FORMAT` and your terminal |

## Follow one request

Use the same `trace_id` and `span_id` across `evaluation.start`, OXP operations and the final result.
The `request` field contains the complete decoded CFN protobuf message. Switch to JSON output to inspect it:

```bash
LOG_FORMAT=json docker compose up -d --force-recreate demo-ce
docker compose logs -f --no-log-prefix demo-ce | jq 'select(.event == "evaluation.start") | .request'
```

`/info` reports capabilities. `/healthz` reports that the HTTP service is alive; `/readyz` additionally
requires registration. These checks do not prove that OXP currently has the particular event required by a call.

## Validate a code change

From `demo-ce/`:

```bash
go test -race ./...
go vet ./...
go build ./cmd/demo-ce
```

From the repository root, validate the Compose configuration with `docker compose config --quiet`.

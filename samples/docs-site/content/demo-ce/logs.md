---
title: Read the logs
---

Logs use Go `slog` with `tint`. The default console format colors stages in cyan,
ALLOW outcomes in green and DENY outcomes in red; warnings and errors have distinct levels.
Colors stay enabled through Compose for the demo recording.

```bash
docker compose up --build -d
docker compose logs -f --no-log-prefix demo-ce
```

Each evaluation starts with `evaluation.start`, including the **complete CFN Evaluate request**
in protobuf JSON (`request`), including `extra`, nested fields and default values.
This is the decoded gRPC message, not HTTP headers or raw transport bytes.
`trace_id`, `span_id`, MAS and caller/destination fields correlate the subsequent steps:

1. `identity.complete`: configured route and MAS scope evaluated.
2. `store.read.start` / `store.read.complete`: prior findings fetched, with `findings_count`.
   `history_used_for_decision=false` makes clear that their contents do not drive this demo's decision.
3. `oxp.realtime.*` / `oxp.context.*`: pre-call event and causal parent/link lookups,
   availability, ancestor count and duration. `context.retry` explains readiness retries.
4. `evidence.selected`: the input actually used (`oxp_realtime`, `inbox` or `oxp_span_fallback`),
   including whether its trace identity was confirmed. A successful lookup alone does not imply valid evidence.
5. `content.complete`: outcome and matching content rule; `content.skipped` explains identity-only paths.
6. `store.write.complete`: the final finding has been acknowledged by the Cognition Store.
7. `evaluation.complete`: final ALLOW/DENY and context sufficiency, followed by check results.
   `evaluation.failed` reports a gRPC failure instead of a successful decision when Store persistence fails.

Out-of-scope MAS requests skip OXP and Store access. With OXP disabled, `store.skipped` explains
that findings are neither read nor persisted. Logs do not include OXP response payloads or findings contents;
the complete incoming CFN request is logged as requested for the demo.

| Variable | Default | Purpose |
|---|---|---|
| `LOG_FORMAT` | `console` | Colored readable output, or `json` for structured collection |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error` |
| `NO_COLOR` | empty | Any non-empty value disables console colors |

To inspect the complete CFN request as formatted JSON:

```bash
LOG_FORMAT=json docker compose up -d --force-recreate demo-ce
docker compose logs -f --no-log-prefix demo-ce | jq 'select(.event == "evaluation.start") | .request'
```

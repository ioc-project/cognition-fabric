# policy-ce

A policy-driven Cognition Engine (`ioc.ce.v1.CognitionEngine`) for the IOC platform. It is agnostic of any
application: it loads identity and content rules per MAS from a JSON file and answers `Evaluate` from them.
It carries no demo-specific rules: the policy file is the only thing that says what is allowed.

CFN calls the CE over gRPC (`:18001`, `ce.v1`, the contract comes from the `ioc-scale-cfn-svc` Go module).
The CE registers itself with CFN over REST (`POST /api/cognition-engine`, conflict recovery by `PATCH`), once
per second until it succeeds and only while CFN answers `/api/internal/diagnostics/health`. It declares a
`health_url` (its `GET /healthz`) and CFN probes it every couple of seconds to decide whether the CE is online,
so the CE sends no heartbeats.

## Layout

```
policy-ce/
├── cmd/policy-ce/            # main: configuration from env, HTTP and gRPC servers
├── pkg/policy/               # policy file schema and decoder (public, reusable to validate a policy.json)
├── internal/engine/          # CognitionEngine: router per MAS, then identity, then content
│   ├── identity/             # identity layer: route decision and MAS scope
│   └── evidence/             # Judge: what a content rule is judged against, one package per kind
│       ├── correlation/      #   pre-call input joined with OXP parent/link context
│       ├── llm/              #   llm_input: model request published before the call
│       ├── mcp/              #   mcp_tool_input: MCP tools/call arguments published before the call
│       ├── a2a/              #   a2a_message_input: A2A message text published before the call
│       └── events/           #   the inbox judge and event parsing shared by llm, mcp and a2a
├── internal/inbox/           # Observe event inbox (POST /events), found again by trace and span
├── internal/cfn/             # registration and conflict recovery with CFN (REST)
├── internal/oxp/             # OXP Cognition Store and session spans client
├── internal/httpjson/        # JSON-over-HTTP exchange shared by the clients
├── internal/ids/             # trace/span id validation
└── config/                   # policy.json: a policy file for two MAS (mounted by the compose service)
```

## Policy file

`CE_POLICY_FILE` (default `/etc/policy-ce/policy.json`) is one of:

- **Per MAS** (several allowed): `{"mas": [{"mas_id": "...", "rules": [...], "content_rules": [...]}, ...]}`.
  A request for a MAS that is not listed is denied (`MAS_SCOPE`) without touching its Cognition Store scope.
  See [config/policy.json](config/policy.json).
- **Single policy**: `{"rules": [...], "content_rules": [...]}`, bound to the MAS id that `CE_MAS_FILE`
  (default `/var/lib/policy-ce/mas-id`) holds, for setups where a bootstrap writes it after registration.
  ```json
  {"rules": [{"id": "A", "effect": "ALLOW", "reason": "...", "sources": ["x"], "destinations": ["y"]}],
   "content_rules": []}
  ```

Identity rules need a unique `id`, an `ALLOW`/`DENY` effect, a `reason` and literal `sources`/`destinations`.
DENY overrides ALLOW and an unmatched route is denied. Content rules apply after identity allows a route.
Each rule has one `evidence`: `tool_input` (default), `a2a_message_input`, `llm_input` or `mcp_tool_input`.
These select the input shape. Every kind uses the same correlation flow; there is no evidence profile selector.

The engine reads Cognition Store history after validating MAS scope, then evaluates content and writes
one finding with the final outcome and reason. Content and missing-context denials are persisted as DENY,
without an earlier identity ALLOW finding. Foreign MAS requests never access the Store. Reads and writes
each have a 1s timeout; Store failures remain fail-closed.

## Input and causal context

1. Look for `tool.started` or `llm.started` in the inbox by the request's exact `trace_id` and `span_id`.
   Observe must publish these events **before sending** the intercepted request. The SDK's pre-call
   recording emits runtime events; it does not make an unfinished span queryable in OXP.
2. Use the event's session to fetch `GET /api/v1/sessions/{session_id}/spans`, following declared
   `parent_span_id` and span links. The OXP session key follows its materialized column: remove everything
   through the first underscore from the native `application_UUID` session ID. Event/session comparisons
   retain the full native ID; a returned `session.id` attribute must match it.
   Earlier siblings, timestamps and destination names are never used
   to guess which activity owns the input.
3. Judge the current input immediately when it is available. Optional history has a 1s timeout, bounded by the shared decision budget and caller deadline;
   its absence is reported by
   `OXP_CAUSAL_CONTEXT` with `passed=false` and does not block a valid pre-call input.
4. If no pre-call event exists, use the selected OXP session/span's own input when available.
   The lookup keeps pagination progress while checking for newly arriving events; a pre-call event
   takes priority. All reads and readiness retries share `CE_CONTEXT_WAIT` and the caller deadline.
   `CE_CONTEXT_ATTEMPTS` caps resolution attempts, including the initial attempt;
   `CE_CONTEXT_RETRY_WAIT` separates failed attempts. Newly arriving pre-call events interrupt
   that interval. Invalid correlation fails immediately; optional history is not retried when
   the current pre-call input is already sufficient. Pagination belongs to one lookup attempt.

The AGNTCY Observe SDK must send normalized runtime events to `POST /events` on the CE HTTP port.
`CE_EVENT_SERVICE` can restrict the accepted `service_name`. OXP is optional for event-only decisions;
set `OXP_API_URL` to enable causal history, span-input fallback and the Cognition Store.

Content regexes inspect **only the current call's input**. Parents and links establish structural context;
their contents do not become the current call's arguments. Malformed messages, conflicting pre-call inputs,
wrong sessions and ambiguous ancestry cannot become an empty successful content check. Missing required
input returns `DENY / MISSING_CONTEXT` (`RACE` on readiness timeout, `GAP` on invalid correlation).

For `llm_input`, `roles` selects `system`, `developer`, `user`, `assistant`, `tool`, `tool_call` or
`tool_definition`. The default is user, assistant, tool and tool_call. GenAI message events do not contain
separate tool definitions: rules requiring them wait for `gen_ai.tool.definitions` on the selected OXP span.
An explicitly empty definitions list is known; an absent list is missing required evidence. Agent responses
remain identity-only, and routes without content rules retain their identity decision.

### Binding and OXP readiness limits

A pre-call event binds its input by exact trace/span and reports `COMPLETE` for rules whose required
input is in that event. OXP's current `SpanMetadataItem` exposes `span_id` and `session_id`, but **not its
own `trace_id`**. Span-only decisions, or decisions requiring definitions borrowed from OXP, therefore
report `DEGRADED_ATOMIC`; the CE cannot confirm the submitted trace or link target trace identities from
that endpoint. `OXP_CAUSAL_CONTEXT` reports this scope even when the structural lookup succeeds.

The client reads at most 5,000 spans, 8 MiB and 128 ancestry levels, with pages of 500. Referenced parents
or links outside the returned session remain pending. The endpoint provides no snapshot token, so a
session changing between pages can produce duplicates; duplicates are rejected rather than guessed.

OXP's server-side session cache does not honor the client's `Cache-Control: no-cache`. For readiness
within the decision hold budget, configure the OXP deployment with `CACHE_ENABLED=false`, or qualify
its cache TTL and ingest latency against that budget. The CE does not change OXP configuration. These
paths are covered with HTTP contract tests. Qualify OXP ingestion timing against the hold budget in each deployment.

### Policy migration

The old profile and tool-prefix environment selectors have been removed and are no longer read.
A policy containing `evidence_by_profile` fails validation as an unknown field. Replace
that map with a single `evidence` for the route (`a2a_message_input`, `llm_input`, `mcp_tool_input`, or
`tool_input` for a decorated tool). Keep all required rules in `content_rules`. The bundled NOA fixture
shows the migrated seven-rule policy without changing its rule patterns.

## Configuration

| Variable | Default | |
|---|---|---|
| `CFN_URL` | `http://ioc-scale-cfn-svc:9002` | CFN base URL (REST, registration) |
| `OXP_API_URL` | empty | OXP base URL (session spans and Cognition Store); optional for pre-call input decisions |
| `ADVERTISED_GRPC_ADDRESS` | `policy-ce:18001` | address CFN uses to call this CE |
| `ADVERTISED_HEALTH_URL` | `http://<host of ADVERTISED_GRPC_ADDRESS>:<port of HTTP_LISTEN_ADDRESS>/healthz` | URL CFN probes with a GET to check the CE is alive (`health_url` at registration). Set it when CFN reaches the HTTP port under another host or port |
| `GRPC_LISTEN_ADDRESS` / `HTTP_LISTEN_ADDRESS` | `:18001` / `:18000` | |
| `CE_NAME` / `CE_VERSION` / `CE_TYPE` | `policy-ce` / `reference-v1` / `CASA` | registration metadata |
| `CE_POLICY_FILE` / `CE_MAS_FILE` | see above | |
| `CE_EVENT_SERVICE` | empty (any) | only accept events from this `service_name` |
| `CE_CONTEXT_WAIT` | `1s` | shared content/context wait budget, at most `25s` |
| `CE_CONTEXT_ATTEMPTS` | `5` | maximum resolution attempts, including the initial attempt |
| `CE_CONTEXT_RETRY_WAIT` | `0.2s` | interval between failed attempts, bounded by the shared budget and caller deadline |

With fast OXP responses, the defaults allow attempts around 0s, 0.2s, 0.4s, 0.6s and 0.8s.
Request latency consumes the same 1s budget, so fewer attempts may run. Success stops the
retry loop; exhaustion returns `DENY / MISSING_CONTEXT`. HTTP requests still have a 1s timeout.

Health: `/healthz`, `/readyz` (ready once registered), `/info`.

## Build and test

```bash
go test -race ./...
docker build --secret id=github_token,env=GITHUB_TOKEN -t policy-ce:dev .
```

or, from the repository root, through compose (builds `policy-ce/Dockerfile`):

```bash
docker-compose --profile policy-ce up --build policy-ce
```

`GITHUB_TOKEN` must be exported by you and able to read `cisco-eti/ioc-scale-cfn-svc`.

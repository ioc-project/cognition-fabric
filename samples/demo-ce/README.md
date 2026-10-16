# policy-ce

A policy-driven Cognition Engine (`ioc.ce.v1.CognitionEngine`) for the IOC platform. It is agnostic of any
application: it loads identity and content rules per MAS from a JSON file and answers `Evaluate` from them.
It carries no demo-specific rules: the policy file is the only thing that says what is allowed.

CFN calls the CE over gRPC (`:18001`, `ce.v1`, the contract comes from the `ioc-scale-cfn-svc` Go module).
The CE registers itself and sends heartbeats to CFN over REST (`POST /api/cognition-engine`, conflict
recovery by `PATCH`, `PUT .../heartbeat`), once per second and only while CFN answers
`/api/internal/diagnostics/health`.

## Layout

```
policy-ce/
├── cmd/policy-ce/            # main: configuration from env, HTTP and gRPC servers
├── pkg/policy/               # policy file schema and decoder (public, reusable to validate a policy.json)
├── internal/engine/          # CognitionEngine: router per MAS, then identity, then content
│   ├── identity/             # identity layer: route decision and Cognition Store findings
│   └── evidence/             # Judge: what a content rule is judged against, one package per kind
│       ├── topology/         #   tool_input: the session's tool node in OXP live topology
│       ├── llm/              #   llm_input: model request published before the call
│       ├── mcp/              #   mcp_tool_input: MCP tools/call arguments published before the call
│       ├── a2a/              #   a2a_message_input: A2A message text published before the call
│       └── events/           #   the inbox judge and event parsing shared by llm, mcp and a2a
├── internal/inbox/           # Observe event inbox (POST /events), found again by trace and span
├── internal/cfn/             # registration, conflict recovery and heartbeat with CFN (REST)
├── internal/oxp/             # OXP Cognition Store and live topology client
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
DENY overrides ALLOW and an unmatched route is denied. Content rules judge the text of a request by regular
expression; where the text comes from is the rule's `evidence`, and each kind has its own `Judge` in `internal/engine/evidence` (`tool_input`, `a2a_message_input`, `llm_input`,
`mcp_tool_input`) and `CE_EVIDENCE` (`topology`, default, or `events`) selects the evidence profile. The
behavior of each evidence kind, the event inbox (`POST /events`) and the known limits are described in the
Fake CE README the code comes from; nothing about them changed.

## Configuration

| Variable | Default | |
|---|---|---|
| `CFN_URL` | `http://ioc-scale-cfn-svc:9002` | CFN base URL (REST, registration and heartbeat) |
| `OXP_API_URL` | empty | OXP base URL (live topology and Cognition Store). Required when a content rule uses `tool_input` evidence; without it the CE judges identity and event evidence only and reads/writes no findings |
| `ADVERTISED_GRPC_ADDRESS` | `policy-ce:18001` | address CFN uses to call this CE |
| `GRPC_LISTEN_ADDRESS` / `HTTP_LISTEN_ADDRESS` | `:18001` / `:18000` | |
| `CE_NAME` / `CE_VERSION` / `CE_TYPE` | `policy-ce` / `reference-v1` / `CASA` | registration metadata |
| `CE_POLICY_FILE` / `CE_MAS_FILE` | see above | |
| `CE_EVIDENCE` | `topology` | `topology` or `events` |
| `CE_EVENT_SERVICE` | empty (any) | only accept events from this `service_name` |
| `CE_TOOL_PREFIX` | empty | stripped from a destination to get the Observe tool name (`tool_input`) |
| `CE_CONTEXT_WAIT` | `1s` | wait for session context, at most `25s` |

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

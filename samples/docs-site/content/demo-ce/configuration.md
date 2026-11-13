---
title: Configure Demo CE
---

# Configure Demo CE

## Rule file

`CE_CONFIG_FILE` defaults to `/etc/demo-ce/config.json`. The root Compose file mounts
`demo-ce/config/config.json` there read-only. The engine reads it at startup; recreate or restart
the CE after changing it.

Use per-MAS configuration to keep the demonstration's scopes explicit:

```json
{
  "mas": [
    {
      "mas_id": "mas-a",
      "rules": [
        {
          "id": "AGENT_TO_TOOLS",
          "effect": "ALLOW",
          "reason": "Agents of this MAS may call its tools",
          "sources": ["planner-agent"],
          "destinations": ["search-tool"]
        }
      ],
      "content_rules": [
        {
          "id": "NO_SECRET_EXPORT",
          "reason": "A tool call must not carry a password or key",
          "destinations": ["search-tool"],
          "pattern": "(?i)\\b(?:password|api[ _-]?key|access token)\\s*(?:is|[:=])\\s*\\S{4,}",
          "evidence": "mcp_tool_input"
        }
      ]
    },
    {
      "mas_id": "mas-b",
      "rules": [
        {
          "id": "ALLOW_ALL_TO_LLM",
          "effect": "ALLOW",
          "reason": "Any agent of this MAS may use the model gateway",
          "destinations": ["llm"]
        }
      ]
    }
  ]
}
```

Identity rules need a unique `id`, `effect` (`ALLOW` or `DENY`), `reason`, and at least one literal
source or destination. An omitted source/destination list matches any value on that side.
DENY overrides ALLOW; an unmatched route returns `DEFAULT_DENY`. Wildcards are not accepted
in identity names. Content rules apply only after an identity ALLOW, for matching source/destination pairs.

A single-MAS file can also use `rules` and `content_rules` at the top level.
It is bound to the ID read from `CE_MAS_FILE`, which defaults to `/var/lib/demo-ce/mas-id`.
Until that file resolves a MAS ID, evaluation returns `Unavailable`.

## Evidence kinds

| `evidence` | Selected input |
|---|---|
| `tool_input` (default) | Decorated tool input from a `tool.started` event |
| `a2a_message_input` | Current A2A message text |
| `mcp_tool_input` | Current MCP `tools/call` arguments |
| `llm_input` | Current model request messages and, when required, tool definitions |

Content `pattern` uses Go regular expressions. Destination scope is required; optional `sources` narrow the rule.
For `llm_input`, `roles` can select `system`, `developer`, `user`, `assistant`, `tool`, `tool_call`
and `tool_definition`. The default is user, assistant, tool and tool_call. Rules requiring tool definitions
wait for explicit definitions; an absent list is not the same as a known empty list.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `CE_CONFIG_FILE` | `/etc/demo-ce/config.json` | Rule file |
| `CE_MAS_FILE` | `/var/lib/demo-ce/mas-id` | MAS binding for a single config |
| `CE_NAME` | `demo-ce` | Registration name |
| `CE_VERSION` | `1.0.0` | Registration version |
| `CFN_URL` | `http://ioc-scale-cfn-svc:9002` | Registration API |
| `OXP_API_URL` | Empty | OXP context and Cognition Store API |
| `GRPC_LISTEN_ADDRESS` | `:18001` | gRPC listener |
| `HTTP_LISTEN_ADDRESS` | `:18000` | Health, info, Observe events and MAS notification listener |
| `ADVERTISED_GRPC_ADDRESS` | `demo-ce:18001` | gRPC address reachable from CFN |
| `ADVERTISED_HEALTH_URL` | Derived from advertised host and HTTP port | Base URL CFN probes (`health_url`; CFN appends `/healthz`). Do not include the path |
| `ADVERTISED_NOTIFICATION_URL` | `ADVERTISED_HEALTH_URL` if set, otherwise the derived health URL | Base URL for MAS notifications (`notification_url`; CFN appends `/notification`). Do not include the path |
| `CE_EVENT_SERVICE` | Empty | Optional `service_name` filter for the inbox |
| `CE_CONTEXT_WAIT` | `1s` | Shared context wait budget, positive and at most `25s` |
| `CE_CONTEXT_ATTEMPTS` | `5` | Maximum attempts, including the first |
| `CE_CONTEXT_RETRY_WAIT` | `0.2s` | Positive delay between attempts |
| `LOG_FORMAT` | `console` | Console or `json` |
| `LOG_LEVEL` | `info` | Logging threshold |
| `NO_COLOR` | Empty | Non-empty disables console colors |

Native runs read these environment variables directly. The root Compose file wires a subset;
add other variables to its `environment` block when you need them in the container.

## Context timing

Readiness lookups share the wait budget and caller deadline. With fast responses, the defaults
permit attempts around 0, 0.2, 0.4, 0.6 and 0.8 seconds. Actual I/O consumes the same budget.
New inbox evidence can interrupt a retry wait. Optional history is not retried when current input
is already sufficient. Cognition Store reads and writes each have a one-second timeout.

The OXP session API may serve cached snapshots. Qualify its cache and ingest timing against the CE
hold budget in the deployment; this service does not configure OXP caching.

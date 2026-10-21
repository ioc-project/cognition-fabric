# D5: MAS onboarding metadata for CEs

**Status:** Open — draft proposal; not implemented.

**Date:** 2026-10-21

**Parties:** CF Team, CE Teams, OXP Team

## Goal

Address [section 5 / open item 6 of the CE–CF–OXP proposal](https://github.com/cisco-eti/ioc-cognition-engines/blob/main/architecture-docs/ce-cf-oxp-integration.md#5-mas-onboarding-to-be-discussed): register agent/tool definitions, topology, documentation and relevant CEs, and let CEs retrieve this metadata by MAS ID. Extend existing Management create/update APIs and CFN's MAS-details GET; onboarding does not deploy the MAS.

## External API consumer impact

- **Richer MAS lookup:** `GET /api/multi-agentic-systems/{mas_id}` gains optional `version`, MAS-level `metadata`, `agents[]`, `tools[]`, `topologies[]` and documentation. Agent descriptions/cards and MCP tool definitions live in the inventories; topology nodes and tool assignments reference their IDs.
- **Two topology sources:** `source: "provided"` is the topology supplied at onboarding and maintained by the MAS owner/client in CF Management. `source: "observed"` is the topology OXP builds from accumulated session telemetry, retrieved and converted by CFN; it may be unavailable until sufficient sessions exist. Both use the same graph format and remain separate. Either may be unavailable; absent data is unknown, not known-empty. `updated_at` is omitted for observed topology with the current OXP API.
- **Runtime compatibility:** no changes are proposed to CE registration, `Evaluate`, `GetInfo` or existing runtime MAS/agent identifiers. Tool IDs match runtime trace tool names exactly. Existing CEs can continue without consuming the new metadata.
- **Metadata refresh:** CFN passes through Management's existing MAS `updated_at` timestamp so clients can tell when CF-managed data last changed. CEs must handle missing/stale data and unsupported description formats. Notification and refresh behaviour remain to be agreed; OXP topology changes require independent refresh.
- **Onboarding clients:** may supply an optional `tag`, client-managed `version`, `metadata` dictionary, agents, tools and a provided topology. The tag need not be unique; existing clients can omit all new fields. Observed topology is populated by CFN from OXP.

## MAS version, metadata and freshness

| Field | Meaning |
| --- | --- |
| `version` | Optional client-supplied string, such as `v1`, `1.01` or `prod`. CF stores and returns it unchanged, without requiring semantic-version formatting or imposing ordering. |
| `metadata` | Optional MAS-level dictionary with string keys and arbitrary JSON values, for custom attributes such as owner or environment. Persist it in CF Management and return it through CFN. |
| `updated_at` | Server-managed UTC RFC 3339 timestamp of the last change to CF-managed MAS data. Management already has a MAS update timestamp; expose it through CFN and ensure changes to related inventories, CE associations and provided topology update it as well. |

The client controls `version`; CF does not generate or increment it. Updating metadata or other MAS fields leaves `version` unchanged unless the client explicitly updates it. `metadata_schema_version` describes the payload format separately. Keep the contracted agent, tool and topology fields explicit; the metadata dictionary holds additional annotations.

**Required response behaviour:** reuse Management's existing MAS `updated_at` and return it through CFN as the freshness indicator. Update it in the same transaction as changes to CF-managed MAS data, including related agent/tool inventories, metadata, CE associations and provided topology. Reading the object does not change this timestamp. It does not cover observed topology fetched from OXP, whose update time is currently unknown. Clients do not supply this field during onboarding. No new per-MAS revision counter is proposed.

## Identifiers and optional tag

| Field | Status | Meaning |
| --- | --- | --- |
| `mas_id` / OXP `application_id` | Existing | Existing CF-assigned MAS UUID, returned on creation and used in runtime contracts. |
| `tag` | New | Optional client-supplied string for convenience; duplicates are allowed, including within the same workspace. No database uniqueness constraint. |
| `agent_id` | Existing | Client-supplied stable string, unique within the MAS; retain current runtime usage. |
| `cf_agent_id` | New | Immutable CF-assigned UUID for the logical agent record; returned by CF. |
| `tool_id` | New | Client-supplied opaque string, unique within the MAS; must exactly match the tool name used in runtime tracing. |

`mas_id` remains the canonical MAS identity; clients retain and reuse that UUID for subsequent operations. `tag` is optional metadata, not a unique identity or an idempotency key. CF must accept duplicate tag values without automatically selecting, reusing or updating an existing MAS by tag. Filtering by the tag, if supported, can return multiple matches.

Persist `(mas_id, agent_id) → cf_agent_id`, with a database uniqueness constraint on `(mas_id, agent_id)`. Updates, restarts, endpoint changes and upgrades that reference existing records preserve their UUIDs. Display names are mutable and are not lookup identities.

**Internal CF change:** Management currently stores `agent_id` as a globally unique string primary key, generating a UUID when the client omits it. Introduce `cf_agent_id` as the UUID primary key and enforce client `agent_id` uniqueness within each MAS using `(mas_id, agent_id)`. Update Management, the UI and CFN integration together, preserving existing records and explicitly mapping legacy identifiers where needed. CEs continue using their existing runtime identifiers; no external field rename is proposed. OXP agent attribute naming remains a separate integration question.

## Agent descriptions, tools and metadata

**Optional onboarding fields:** `tag`, `version`, MAS-level `metadata`, `agents`, `tools` and `topologies` may each be omitted; basic MAS onboarding does not require them. Clients may submit only topology entries with `source: "provided"`; entries with `source: "observed"` are obtained from OXP by CFN and are not client-writable onboarding data. When entries are supplied, each agent requires `agent_id` and each tool requires `tool_id`; CF generates `cf_agent_id` for registered agents. Agent/tool references in the provided topology must resolve to inventories registered in the MAS, either already stored or supplied in the same request. Omitted metadata is unspecified, not evidence that no agents, tools or relationships exist. CEs must handle missing metadata explicitly according to their requirements.

- **Agents:** each inventory entry has `agent_id`, display metadata, optional namespaced annotations and optional `agent_descriptions[]`. Support multiple descriptions for the same agent: [A2A Agent Cards](https://a2a-protocol.org/v1.0.1/specification/) describe interaction interfaces, skills, capabilities and security requirements; [OASF records](https://docs.agntcy.org/oasf/agent-record-guide/) describe discovery metadata, skills/domains, locators and extensible modules used by the AGNTCY Directory. Accept an inline document, a source URL, or a Directory record reference, with an explicit `format` and schema/spec version. Preserve each original document with its provenance, collection time and content hash. A Directory record CID identifies a particular record's content, not the logical agent; retain the separate CF/client identities. Record verification separately; retrieval does not prove identity. CEs must identify supported formats and handle unsupported/missing descriptions explicitly. Other descriptions can be labelled by their agreed format rather than presented as A2A cards.
- **Tools:** store `tool_id` and the unmodified [MCP Tool definition](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) from `tools/list`, including input/output schemas, annotations and extensions. Provider identity may be recorded as optional `provider_id` metadata. Record MCP version, provider discovery context and provenance. Keep provider definitions distinct from definitions presented to the LLM in OXP events. Annotations remain hints.
- **Documentation:** optional inline content or references. Generic `metadata` holds annotations; CE-required fields need agreed schemas. Do not embed credentials.

**Tool identity:** whoever supplies the tool inventory must ensure that each `tool_id` is unique within the MAS and exactly matches the runtime trace tool name. CF treats it as an opaque string: prefixes such as `documents.` are allowed but have no special meaning, are not required, and are not added or parsed by CF. The same identifier is used in topology `tool_ids[]` and enforcement tool references. Any name collisions must be resolved by the MAS/provider and reflected consistently in onboarding and tracing; CF must not guess a provider or silently rename a tool. Reject duplicate tool IDs within a MAS.

## Topologies

Expose the separate, optional graphs in a `topologies[]` array, using the same logical graph format. Each entry requires a `source` field with one of these values:

| `source` | Source and ownership | Availability |
| --- | --- | --- |
| `provided` | Supplied at onboarding, stored in CF Management, and maintained through Management updates by the MAS owner/client. | Available once supplied. |
| `observed` | OXP-derived application topology, retrieved and converted by CFN. Clients do not write it through onboarding. | May be unavailable initially: OXP developers confirmed to the user that application topology is built from accumulated sessions and requires sufficient sessions. |

Either, both or neither may be available. Allow at most one entry per source and reject duplicate sources. Array order does not establish precedence. Keep the graphs independent; do not automatically merge them, choose one as authoritative, or overwrite one with the other. A difference is available for CE analysis and does not itself establish which source is wrong. `observed` identifies the OXP-derived view, not a guarantee of exhaustive coverage.

### Shared graph format

Use a static logical MAS graph with both `nodes[]` and `edges[]` as arrays. Tools are attached to agent nodes; separate tool-executor nodes are not required in this logical representation.

- `nodes[]`: each agent node uses the client/runtime `agent_id` as `id`, with optional `tool_ids[]` referencing tools in the separate inventory when registered. Reject duplicate node IDs and duplicate tool IDs within a node. An empty tool list means explicitly no tools; an omitted tool list means unspecified. Agent cards and tool definitions remain in their inventories.
- `edges[]`: `source` and `target` reference node IDs. Optional `interaction_type` describes the relationship; agree the vocabulary, with candidates including `delegation`, `message`, `handoff`, `return`. Preserve OXP's `conditional` and `data` edge annotations when available; they do not define executable routing rules.
- `completeness`: `complete` declares exhaustive agent/tool relationships within the agreed scope; `partial` makes missing relationships unknown. Omitted topology is unknown, not known-empty.

**Open decision: entry/exit nodes.** Keep support for `__start__` and `__end__` open. Agree their representation and how they are distinguished from agents before finalizing validation; do not assume every possible node is an agent or silently discard these markers during conversion.

**OXP compatibility:** OXP already exposes `GET /api/v1/applications/{application_id}/topology`, where `application_id` corresponds to `mas_id`. Its current response uses a node map and an edge array and may include framework execution nodes. CF's format should be compatible through an explicit conversion, rather than requiring identical JSON. If CFN retrieves topology from OXP, CFN must transform it into the CF format before returning it to CEs: convert the node map to an array, preserve IDs and edge meaning, resolve agent/tool references, and handle framework tool-executor nodes through agreed mapping rules. Do not infer tool definitions, interaction types or completeness from missing or ambiguous instrumentation. The treatment of entry/exit nodes remains the open decision above.

### Independent snapshot metadata

Each returned graph carries its own completeness information. Include a single source timestamp, `updated_at`, when known:

| Field | Meaning |
| --- | --- |
| `updated_at` | UTC RFC 3339 timestamp when that source last updated the graph. CF Management records this for `provided`. Omit it for `observed` with the current OXP API. |

The current OXP topology endpoint returns only `nodes` and `edges`, without a source update timestamp. The observed graph's update time therefore remains unknown; CFN must not use its fetch time as `updated_at`. If OXP later exposes the source timestamp, CFN can pass it through. Clients submit the provided graph content; CF Management sets its `updated_at`. Additional timing fields can be added later if needed. Agree caching, refresh and unavailable/error response semantics separately; CFN need not query OXP on every metadata request. Distinguish an unavailable graph from a known-empty graph.

Validate edge endpoints against the nodes of their own graph. Validate provided agent/tool references against the MAS inventories. An observed graph may contain agents/tools that were never onboarded; preserve their runtime identifiers and explicitly identify unresolved inventory mappings rather than dropping them or creating CF records automatically. Edges grant no authorization. Parallel joins, retries and execution order are outside this initial contract. Channels need explicit semantics if required.

## Illustrative request fragment

The optional provided topology references client IDs, allowing single-request creation before CF UUIDs exist. The request below supplies one `topologies[]` entry with `source: "provided"`; CFN may additionally return an entry with `source: "observed"` and independent snapshot metadata. This subset illustrates the proposed CF wrapper, not current NOA MCP/A2A/OASF capabilities or a Directory API payload. Provider discovery/provenance details are abbreviated. Directory references must identify the configured Directory instance as well as the record CID.

Clients omit MAS and topology `updated_at` fields from the onboarding request; CF Management sets them when the relevant stored data is created or changed and includes them in responses.

```json
{
  "metadata_schema_version": "1.0",
  "tag": "noa-trip-planner-dev",
  "name": "NOA Trip Planner",
  "version": "v1",
  "metadata": {
    "owner": "travel-team",
    "environment": "development"
  },
  "agents": [
    {
      "agent_id": "moderator",
      "name": "Moderator"
    },
    {
      "agent_id": "schedule_agent",
      "name": "Schedule Agent",
      "agent_descriptions": [
        {
          "format": "a2a",
          "spec_version": "1.0.1",
          "source_url": "https://schedule.example.com/.well-known/agent-card.json"
        },
        {
          "format": "oasf",
          "schema_version": "1.0.0",
          "source": {
            "type": "agntcy-directory",
            "directory_id": "configured-directory",
            "record_cid": "<directory-record-CID>"
          }
        }
      ],
      "metadata": {
        "owner": "travel-team"
      }
    }
  ],
  "tools": [
    {
      "tool_id": "list_documents",
      "definition": {
        "name": "list_documents",
        "description": "List available travel documents.",
        "inputSchema": {
          "type": "object",
          "additionalProperties": false
        }
      }
    }
  ],
  "topologies": [
    {
      "source": "provided",
      "completeness": "partial",
      "nodes": [
        {
          "id": "moderator"
        },
        {
          "id": "schedule_agent",
          "tool_ids": [
            "list_documents"
          ]
        }
      ],
      "edges": [
        {
          "source": "moderator",
          "target": "schedule_agent",
          "interaction_type": "delegation"
        },
        {
          "source": "schedule_agent",
          "target": "moderator",
          "interaction_type": "return"
        }
      ]
    }
  ]
}
```

## Illustrative MAS response

CFN returns the MAS identity, client-supplied fields, Management's existing MAS `updated_at`, agent/tool inventories, and both topologies. Every agent/tool reference in this example resolves to an inventory entry. The example assumes both tools have been registered; the earlier onboarding request is a subset. The provided graph has its own `updated_at`, while the OXP-derived graph has no timestamp. The observed graph additionally assigns `read_document` to `schedule_agent` and omits the return edge. Both graphs are partial, so missing relationships remain unknown. IDs, timestamps, description references, tool definitions and graph differences are illustrative.

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "workspace_id": "660e8400-e29b-41d4-a716-446655440000",
  "name": "NOA Trip Planner",
  "tag": "noa-trip-planner-dev",
  "version": "v1",
  "updated_at": "2026-10-21T10:00:00Z",
  "metadata": {
    "owner": "travel-team",
    "environment": "development"
  },
  "agents": [
    {
      "agent_id": "moderator",
      "cf_agent_id": "7f99c7ae-9d6e-4f72-b98c-c960ba17a192",
      "name": "Moderator"
    },
    {
      "agent_id": "schedule_agent",
      "cf_agent_id": "ed6f0101-52e0-4e9b-9335-68b7294d1c21",
      "name": "Schedule Agent",
      "agent_descriptions": [
        {
          "format": "a2a",
          "spec_version": "1.0.1",
          "source_url": "https://schedule.example.com/.well-known/agent-card.json"
        },
        {
          "format": "oasf",
          "schema_version": "1.0.0",
          "source": {
            "type": "agntcy-directory",
            "directory_id": "configured-directory",
            "record_cid": "<directory-record-CID>"
          }
        }
      ],
      "metadata": {
        "owner": "travel-team"
      }
    }
  ],
  "tools": [
    {
      "tool_id": "list_documents",
      "definition": {
        "name": "list_documents",
        "description": "List available travel documents.",
        "inputSchema": {
          "type": "object",
          "additionalProperties": false
        }
      }
    },
    {
      "tool_id": "read_document",
      "definition": {
        "name": "read_document",
        "description": "Read a travel document and return its content.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "file_path": {
              "type": "string",
              "description": "Full absolute path to the document."
            }
          },
          "required": ["file_path"],
          "additionalProperties": false
        }
      }
    }
  ],
  "topologies": [
    {
      "source": "provided",
      "updated_at": "2026-10-21T10:00:00Z",
      "completeness": "partial",
      "nodes": [
        {"id": "moderator"},
        {"id": "schedule_agent", "tool_ids": ["list_documents"]}
      ],
      "edges": [
        {"source": "moderator", "target": "schedule_agent", "interaction_type": "delegation"},
        {"source": "schedule_agent", "target": "moderator", "interaction_type": "return"}
      ]
    },
    {
      "source": "observed",
      "completeness": "partial",
      "nodes": [
        {"id": "moderator"},
        {"id": "schedule_agent", "tool_ids": ["list_documents", "read_document"]}
      ],
      "edges": [
        {"source": "moderator", "target": "schedule_agent", "conditional": true}
      ]
    }
  ]
}
```

## API and lifecycle changes

1. Extend Management's MAS create/update contract with optional `tag`, client-supplied `version` and a MAS-level `metadata` dictionary. Allow duplicate tag values without a database uniqueness constraint. Preserve the version string as supplied; CF never increments it automatically. Creation returns the canonical `mas_id`; updates continue to address that UUID. Do not implement automatic reuse or upsert based on the tag. Existing clients can omit all new optional fields. Preserve explicit CE associations; define omission, empty collections, removals and concurrent-update semantics.
2. Extend CFN's `GET /api/multi-agentic-systems/{mas_id}` to return the stored `version` and `metadata`, Management's existing MAS `updated_at`, inventories, `cf_agent_id` mappings, all supported agent-description/tool snapshots with formats and provenance, optional `topologies[]` entries identified by `source: "provided"` or `source: "observed"`, documentation and relevant CE configuration. Resolve the workspace from `mas_id`. Retrieve the provided graph from Management; obtain the observed graph from OXP and normalize it into CF's graph format. Return each with its own snapshot metadata and availability information; do not merge them automatically.
3. Reuse MAS `updated_at` for freshness and update it atomically with changes to stored MAS data and related inventories/associations. Keep it independent of the client-supplied MAS `version` and per-CFN `config_version`; fetching observed topology does not change it. Define notifications of CF-managed changes and initial discovery/reconciliation after missed events. Durable delivery, snapshot history and rollback remain separate existing issues.
4. Agree required/optional fields and CE behaviour for absent or stale metadata; missing evidence must remain distinguishable from known-empty data.

## Current gaps / meeting decisions

Management lacks this agreed metadata schema, the optional `tag` field and the proposed agent-ID mapping; CFN's GET currently drops agents/config and MAS timestamps. The local Demo MAS has no registered agent rows, while OXP reports names such as `schedule_agent`.

**CF + CE teams:** agree identifier migration/backfill for existing records, optional tag filtering semantics, supported A2A/OASF/MCP versions, Directory resolution and provenance, topology vocabulary/scope, completeness expectations, read response and update semantics, and coverage of related changes by MAS `updated_at`. **CF + OXP:** agree observed topology conversion and identifier mapping, entry/exit node handling, availability of `updated_at`, and refresh/cache/error semantics. Keep provided and observed graphs separate. **OXP + Proxy:** agree identifier correlation and runtime evidence alignment.

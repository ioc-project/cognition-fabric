# D6: MAS onboarding metadata for CEs

**Status:** Agent identity migration and JSON onboarding are implemented. Stage 3
adds persisted metadata and CE retrieval. Graph visualization is stage 4; optional
OXP observed topology is stage 5 and remains disabled.

This document records the issue #43 contract implemented by Management, CFN and
the Web UI. The [implementation plan](../plans/issue-43-mas-onboarding-metadata.md)
contains the agreed scope and staged acceptance checks.

## Ownership and identity

An operator or provider onboards a MAS through the Management API or Web UI.
Onboarding stores a declaration; it does not deploy or reconfigure the MAS.
The MAS runs independently of CF and does not call the onboarding API itself.

- CF-assigned MAS `id` remains canonical. OXP `application_id`, when used later,
  corresponds to that ID. Optional `tag` is nonunique metadata, never an upsert key.
- Client/runtime `agent_id` is unique within one MAS. Immutable `cf_agent_id` is
  CF's storage UUID. Existing runtime IDs and CE binary contracts are unchanged.
- Runtime `tool_id` is unique within a MAS and matches the emitted trace name
  exactly. CF does not add or interpret prefixes. It is separate from the native
  MCP tool name and CF's MCP record ID.

## Write and read endpoints

Create with `POST /api/workspaces/{workspace_id}/multi-agentic-systems` and update
with `PUT /api/workspaces/{workspace_id}/multi-agentic-systems/{mas_id}`. Create
returns the canonical ID and name. Management GET returns the stored declaration,
CE associations and their per-MAS `mas_config` overrides.

CEs retrieve expanded metadata using
`GET /api/multi-agentic-systems/{mas_id}?metadata=true` on CFN. CFN resolves the
assigned workspace from its configuration. Without the query parameter, the
historical response shape is retained for existing binary CEs, including the
historical CE fields. Actual Security Detections/CASA consumer artifacts are not
available in this workspace, so their expanded-response compatibility is
unverified; do not infer it from the Demo CE decoder. This explicit representation
keeps existing consumers on their existing contract.

Expanded CFN reads preserve arbitrary nested JSON and large numbers, including
agent descriptions, definitions and CE overrides. Every top-level timestamp
(`updated_at` and `created_at`) is UTC RFC 3339 with `Z`, or is omitted. CFN parses
explicitly zoned strings with `time.RFC3339Nano` and converts them to UTC without
changing the instant. Absent/null fields are omitted silently; zone-less,
unparseable or non-string values are omitted with a warning identifying the
`mas_id`, field and reason. Timestamp problems never fail the GET: it returns
HTTP 200 with the remaining metadata. CFN never infers or configures a source
timezone. Zone-less Management values remain omitted until the separate
Management UTC-timestamp issue makes Management emit UTC `Z`; #43 does not depend
on that issue. Nested JSON (including its timestamps), raw Management responses
and CFN configuration snapshot timestamp strings retain their existing format.

## Optional fields and update presence

| Field | Meaning | Omitted on update | Explicit clear |
| --- | --- | --- | --- |
| `metadata_schema_version` | Client's metadata schema label | Retain | `null` |
| `tag`, `version` | Client strings; no automatic version increment | Retain | `null` |
| `metadata` | MAS annotations object | Retain | `null` |
| `documentation` | Inline documents or references | Retain | `[]` |
| `agents[].agent_descriptions` | Multiple structured descriptions | Retain for retained agent ID | `[]` |
| `agents[].metadata` | Agent annotations object | Retain for retained agent ID | `null` |
| `tools` | Runtime tool inventory | Retain | `[]` |
| `topologies` | Optional provided graph | Retain | `[]` |
| `tools[].provider` | Native MCP binding | Retain for retained tool ID; new tool unbound | `null` |

New list fields reject explicit `null`. No new metadata is fabricated for legacy
records. Empty lists remain distinct from never supplied fields. Existing legacy
fields retain their prior semantics: supplied agent inventories sync by runtime
ID; supplied MCP servers sync by exact name; an omitted MCP server list retains
it, while omitted/empty tools inside a supplied server remove its native tools.
Server names are unique per MAS and native tool names per server, including empty
strings. The same native name on different servers is valid.

## Documents and rich descriptions

Documentation entries accept `content`, `source_url` or `source`, optional
`media_type` and caller `provenance`. Agent descriptions additionally require
`format`, with optional `spec_version` or `schema_version`. Unknown extensions,
formats and versions are preserved. `a2a`/`1.0.1` and `oasf`/`1.0.0` are recognized
wrappers (`support_state: supported`); other pairs return `unsupported`. This
classification does not validate a document's schema, signatures or identity.

Directory references use
`source: {type: "agntcy-directory", directory_id: "...", record_cid: "..."}`.
A CID identifies a record snapshot, not an agent. CF retains inline content and
caller provenance unchanged, adds `collected_at`, and hashes supplied content as
`content_hash`. Inline entries have `resolution_state: inline`; reference-only
entries have `unresolved` and no document hash. A URL is never hashed as though it
were the remote document. Verification assertions remain caller claims.

Unchanged snapshots retain `collected_at` on resends and reordering. Matching
includes caller content/references, format/version, provenance and extensions;
meaningful caller changes create a new collection timestamp. Duplicate matching
entries retain their separate stored collection times.

**There is no remote retrieval:** writes, reads and background tasks do not fetch
Agent Cards, OASF records, Directory records or documentation URLs. No resolver,
scheduler or OXP request is introduced in stage 3.

## Tool snapshots and bindings

Native MCP tools retain legacy `name`, `description`, and `parameters` and may
supply `definition` (the complete MCP tool object), `protocol_version`, and caller
`provenance`. Definitions retain `inputSchema`, `outputSchema`, `annotations` and
unknown extensions. The legacy `parameters` projects `inputSchema`. Conflicting
explicit legacy/full declarations return 422. A full native definition's name
must match the native tool name.

Runtime inventory entries require `tool_id`. A binding is declared with
`provider: {mcp_server_name, native_tool_name}`. It resolves within this MAS and
reads the authoritative native snapshot; it is not a second writable copy.
A runtime definition may initialize that snapshot when it agrees with the native
catalogue's overlapping fields. Contradictory explicit definitions, including
null, are rejected. Omitting a retained binding or rich field preserves it.
Unbound tools may carry their own full definition.

The effective `definition` is separate from `source_snapshot`, which preserves
the original supplied definition. Editing legacy parameters/descriptions updates
the effective definition while retaining its unknown fields. Server provenance
contains the current `content_hash`, `collected_at` and `state` (`snapshot` or
`derived`), with caller assertions separately under `claims`. A no-op resend does
not replace the original source snapshot or label a derived document as original.
UI writes submit only caller `claims` as tool provenance, omitting that field
when no claims exist. Server bookkeeping is never converted to caller claims;
document provenance keeps its separate opaque-object contract.

```json
{
  "name": "Example MAS",
  "agents": [{"agent_id": "reader"}],
  "mcp_servers": [{"name": "documents-mcp", "tools": [{
    "name": "list_documents", "parameters": {"type": "object"}
  }]}],
  "tools": [{
    "tool_id": "list_documents",
    "provider": {"mcp_server_name": "documents-mcp", "native_tool_name": "list_documents"},
    "definition": {
      "name": "list_documents", "inputSchema": {"type": "object"},
      "outputSchema": {"type": "array"}, "annotations": {"readOnlyHint": true}
    }
  }],
  "topologies": [{
    "source": "provided", "completeness": "partial",
    "nodes": [{"id": "reader", "tool_ids": ["list_documents"]}], "edges": []
  }]
}
```

## Graph contract

Neither topology source is required. Stage 3 clients may supply at most one graph,
with `source: provided`, `completeness: complete|partial`, and array `nodes` and
`edges`. Node `type` is `agent` by default or explicitly `agent`, `start` or `end`.
Start and end are independently optional graph-local markers, not agent records;
they cannot have `tool_ids`, including an empty list. Agent IDs resolve against
the MAS inventory. Optional `tool_ids` resolve against the runtime inventory;
omission means unspecified, while `[]` means explicitly none. Node IDs and tool
assignments within a node must be unique.

Edges require graph-local `source` and `target`, and may carry `interaction_type`
(an opaque string), `conditional` and arbitrary JSON `data`. Edges imply neither
an executable routing rule nor authorization. CF inserts no helper nodes or
bypass edges. Provided `updated_at` is server-owned, UTC-aware, and changes only
when the graph content changes; clients omit it when writing.

Reads expose independent availability:

```json
{
  "topology_sources": {
    "provided": {"status": "available"},
    "observed": {"status": "disabled"}
  }
}
```

Absent provided data has status `absent`; a declared empty graph is available.
Observed conversion, optional environment enablement, cache/error handling and
unresolved observed IDs belong to stage 5. It must not overwrite provided data.
The current OXP topology response has no source timestamp; its eventual observed
`updated_at` stays absent rather than using fetch time.

## Atomic changes and freshness

Management serializes each MAS mutation on its parent row before reading retained
inventories/graphs. Membership writes take a shared CFN scope lock before the MAS
lock; CE registration uses that scope exclusively before claim/carry-forward.
Multi-MAS carry-forward locks parents in stable ID order. This avoids inversions
while allowing independent MAS writes to run concurrently.

MAS GET uses a read-only `REPEATABLE READ` transaction to return one committed
parent/inventory/association snapshot without blocking on mutation row locks.
Automatic CE attachment skips and logs inactive CFNs; explicit association
requests retain activity validation and transactional rejection.

Validate the final retained-and-supplied graph, inventory and bindings together.
Removing a referenced agent, runtime tool or native provider returns HTTP 422 with
`detail: {code: "dangling_references", message, references: [...]}` listing every
affected node, edge, tool or binding and directing the caller to fix/clear it in
the same request. A warning is logged. Schema failures use FastAPI's list-shaped
422 detail; the UI handles both shapes without discarding the draft.

Metadata, inventory, CE associations, overrides and MAS `updated_at` commit or
roll back together. Config regeneration occurs once after a successful commit;
failed validation generates no intermediate configuration. Existing standalone
association/override routes follow the same rule. Routine CE liveness updates,
metadata reads and migration backfill do not touch MAS freshness. Existing
best-effort lifecycle hints plus pull remain unchanged; durable notifications
remain issue #38.

## Web UI and NOA declaration

Create supports Form and full JSON. Edit offers full JSON at page level and a
JSON editor in the fifth Topology tab. Untouched graph/binding fields are omitted
by form saves; full JSON sends the explicit supported request. Read-only mode
shows a read-only graph alongside persisted syntax-highlighted, collapsible JSON,
with actual directed agent relationships and distinct optional Start/End nodes.
Agent hover and selection show the same dashed outline as `/fabric`. Clicking
an agent opens a right-hand Inspect panel with its details and assigned tools;
nodes do not expand. Pan/zoom/fit and the canvas palette also align with `/fabric`;
there is no graph editor. Provided
and Observed remain independent, and an unavailable source never substitutes the
other graph or its JSON. Stage 4 uses only the stored Management response;
optional observed-source requests remain stage 5.

The standalone [NOA declaration](../../deploy/local/mas-onboarding/noa-mas-local.json)
contains runtime agents, actual tools/assignments and a partial source projection.
NOA's Python/HTTP tools are not MCP, so the declaration contains no invented MCP
provider. No application code, instrumentation or runtime configuration changes
are required. The operator can paste this JSON in a deployed UI without reading
source files inside a cluster.

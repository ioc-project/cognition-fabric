# Onboard the NOA MAS through Management

Copy the contents of [noa-mas.json](noa-mas.json) into the **JSON** mode of
`/mas/create` in the CF web UI. The selected workspace supplies the API path;
the request body does not contain a workspace ID or a generated MAS/agent UUID.
This is an operator/provider action, independent of the running MAS. A deployed
browser and Management API need only the supplied JSON, with no source checkout,
in-cluster file lookup, exporter or OXP connection.

The example uses the four existing NOA runtime agent IDs. It deliberately has no
credentials, machine-specific URLs or CE IDs. After pasting, switch to **Form**,
select your environment's existing Demo CE, and save. The selection appears in
the same request as `cognition_engine_ids`; switching to JSON shows its actual
value. Keep existing NOA deployment configuration and runtime setup unchanged.
Registration does not deploy, execute, reconfigure or self-register NOA.

## Current topology limitation

Stage 2 accepts `topologies` only as a **browser draft placeholder**. The UI labels
it **Not saved**, excludes it from the Management request, and keeps a copyable
recovery view after a successful create/update. A recovery copy is scoped to the
MAS/workspace in browser session storage when available. Copy the graph before
closing the tab; it is not stored by CF and does not appear in Management reads.
No graph is put into `config`. The other current API fields are submitted normally;
unknown fields, such as the future runtime `tools` catalogue, are reported instead
of silently discarded. Topology persistence follows in stage 3; visualization
follows in stage 4, in the fifth Topology tab introduced during stage 2.

In Form mode, **Topology JSON** is immediately below MCP Servers on create and
inside the dedicated fifth **Topology** tab during editing. In view mode this
tab is read-only: stage 2 shows an unavailable-visualization placeholder and any
local pending draft as syntax-highlighted JSON under **Pending topology draft**.
The JSON is initially expanded and can be collapsed like audit JSON; its copy
action remains available when collapsed. Stage 4 adds the read-only graph while
keeping the collapsible read-only JSON alongside it for the selected source.
Edit mode replaces the view with the JSON text box, never an editable graph canvas.
Enter the `topologies` array,
not an entire MAS request, in that box. In JSON mode it is the same draft's
`topologies` property. Both modes preserve `agent`, optional `start` and optional
`end` nodes without inserting either marker automatically. An empty list is a
pending explicit clear; it does not clear server data during stage 2 or trigger
an unsaved-graph recovery notice. Optional OXP observed data is connected in stage 5.

## Create, update and read-back

- Create uses `POST /api/workspaces/{workspace_id}/multi-agentic-systems`; `name`
  is required and is unique within the workspace. Reusing it returns a conflict,
  not an upsert. Choose a different name or update the existing record.
- Edit the existing MAS, then use the page-level **Form / JSON** switch beside
  Save/Cancel. JSON mode edits the full `PUT` request, replacing the tabbed editing
  area. Returning to Form restores the selected tab. The MAS/workspace in the URL
  remain fixed; output IDs, timestamps and CE status are excluded from the draft.
- Update fields are optional. Removing a property in JSON omits it from the
  request; an explicit empty agents/MCP list replaces the inventory. Keep retained
  agents' runtime IDs so their internal UUIDs remain stable. Explicit nulls retain
  the current API's field-specific behavior: for example, update `config: null`
  currently leaves its value unchanged, while `{}` replaces it with an empty object.
- Unrelated form edits do not submit CE membership/config overrides. Full JSON
  may explicitly supply `cognition_engine_ids` or `cognition_engine_configs`.
  Existing automatic CE attachment still runs on ordinary backend updates, so
  omitted CE fields do not guarantee unchanged server membership. Use saved
  read-back rather than assuming it is frozen.
- After saving, inspect the actual Management GET response and UI. Confirm the
  four runtime agent IDs, their stable `cf_agent_id` values after later edits,
  descriptions, selected CE associations and configuration. A pending topology
  recovery panel is client-side text, not evidence of server persistence.
- Malformed/unsupported JSON does not produce a write. Server validation errors
  retain the draft and show field paths or every dangling reference. Some existing
  CE-ID validation failures happen after MAS data has committed: inspect the MAS
  list/current record before retrying a failed save. The UI does not retry it or
  promise atomic writes. Cancel explicitly discards the current edit draft.

Provider automation can submit the same current supported body directly to the
Management API. During stage 2, exclude `topologies` explicitly before making a
direct call; the UI does this visibly. Do not rely on the old API ignoring unknown
fields. No running service reads NOA source files to construct this request.

## Logical topology and its source

The checked-in graph was derived during development by read-only inspection of
`../noa-trip-planner/src/noa_trip_planner/multi_agent_system.py`, particularly
`create_multi_agent_system`. It represents the default all-agents capability
graph; `available_agents` can select a smaller request-specific specialist set.
This declaration does not claim to be an observed execution trace.

The source has an entry edge from `START` to `moderator`, conditional delegation
from the moderator to each selected specialist, and conditional returns from
each specialist to the moderator. The example retains these real directed edges.
It includes an optional end marker, but deliberately leaves it disconnected:
the source exits through the non-agent `finalize` helper before `END`. Removing
that helper must not invent a direct moderator-to-end edge. Specialist tool
executor nodes and their loops are also omitted. Consequently completeness is
**partial**, and the projection must not be treated as the full LangGraph control
flow, a mandatory execution order or an authorization policy.

Both marker types are independently optional. To make a start-only example,
remove the end node. For an end-only example, remove the start node and its
incident edge. Removing both the start node/edge and end node leaves a valid
agent-only graph with the six moderator/specialist edges. Markers are graph-local
nodes, not agent inventory records; do not give them internal agent IDs or tools.

The current Python/HTTP NOA tool service is not MCP. `mcp_servers` is empty until a
real provider is configured. The existing runtime tool inventory, for stage 3,
is `schedule_agent`: `list_documents`, `read_document`; `itinerary_agent`:
`query_graph_database`, `calculate`; `concierge_agent`: `list_documents`,
`read_document`, `calculate` (see the read-only `tool_registry.py`). Stage 2
adds neither unsupported tool declarations nor unresolved `tool_ids` references
or fabricated MCP bindings to the request.

Development verification, from the CFN checkout:

```bash
python3 -m unittest discover -s deploy/local/tests -p test_mas_onboarding.py -v
```

This check reads the source with Python's AST parser without importing or running
NOA. It is a development check for the static declaration, not an onboarding step.

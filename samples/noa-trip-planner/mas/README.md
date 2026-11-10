# Onboard the NOA MAS through Management

Paste [noa-mas-local.json](noa-mas-local.json) into **JSON** mode at `/mas/create`. The selected
workspace supplies the API path; the body contains no workspace/generated IDs,
credentials, machine-specific endpoints or CE IDs. Switch to Form to select your
existing Demo CE, then save. This operator/provider action stores a declaration;
it does not deploy or reconfigure NOA. NOA runs independently of CF.

The same JSON can be sent directly to
`POST /api/workspaces/{workspace_id}/multi-agentic-systems`. Create returns the
canonical ID. Existing MAS edits use `PUT` on that ID; duplicate names conflict,
and optional tags are not upsert keys.

## Topology and editing

Management now persists `topologies` and runtime `tools`. Form create has a
Topology JSON box below MCP Servers. Edit has a dedicated fifth **Topology** tab;
full JSON editing is available at page level. Enter the topology array in the
box, or the full request in JSON mode. Start/end markers are independently
optional. Clearing the box sends `topologies: []`; leaving it untouched retains
the saved graph.

Read-only mode displays the provided graph with directed edges and optional
Start/End markers. Hovering or selecting an agent shows a dashed outline, and
clicking it opens its details and assigned tools in the right-hand Inspect panel.
The matching highlighted JSON remains collapsible and copyable alongside the
graph. Optional observed OXP topology follows in stage 5 and is currently disabled.
There is no browser-only pending topology after a successful save.

Reload the details page to verify persisted data. Expanded CE retrieval is
`GET /api/multi-agentic-systems/{mas_id}?metadata=true` on CFN; the default remains
the legacy representation for existing CEs. See the [metadata contract](../../../docs/discussions/0006-mas-onboarding-metadata.md)
for presence, snapshot, timestamp and reference-validation rules. Invalid updates
return 422 without applying metadata or CE association changes. The draft remains
available for correction.

## Declaration source and limits

The declaration uses the four runtime IDs and descriptions in
`noa-trip-planner/src/noa_trip_planner/multi_agent_system.py`. It represents the
default all-agents capability graph; `available_agents` may select fewer
specialists per request. It is not an observed trace.

The graph retains entry to `moderator`, its three delegation edges and the three
specialist returns. The `moderator` → `__end__` edge represents completion through
the non-agent `finalize` helper, which is collapsed into that edge. Tool-executor
loops are omitted, so completeness remains **partial**.

Runtime tool assignments come from the read-only `tool_registry.py`: schedule
uses `list_documents`/`read_document`, itinerary uses
`query_graph_database`/`calculate`, and concierge uses
`list_documents`/`read_document`/`calculate`. The moderator has explicitly no tools.
Definitions preserve the Python declarations' names, documentation and argument
shapes; their metadata identifies their Python/HTTP origin. These are unbound
runtime tools. NOA's tool service is not MCP, so `mcp_servers` is empty.

Development verification reads source via AST without importing or running NOA:

```bash
python3 -m unittest discover -s deploy/local/tests -p test_mas_onboarding.py -v
```

This is a source consistency check, not a deployed onboarding command. The
running MAS, its launch configuration and its application checkout stay unchanged.

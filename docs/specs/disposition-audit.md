# CFN disposition audit contract

<!-- kind: source · source of truth: GitHub (this directory) -->

CFN extends the existing audit entity for [issue #34](https://github.com/cisco-eti/ioc-scale-cfn-svc/issues/34).
Each handled `GetDisposition` request schedules one audit insert, including errors
before a CE can be called. The CE RPCs, routing and returned dispositions are unchanged.

## Shared entity

| Field | Contract |
| --- | --- |
| `source` | Nonempty original producer identity. New CFN records explicitly use `CFN`. |
| `audit_type` | `CE_INVOKED` if Evaluate was attempted; `CE_NOT_INVOKED` for earlier failures. |
| `resource_type` | Existing `COGNITION_ENGINE` category. |
| `resource_identifier` | Selected CE ID, including connection/evaluation failures; empty if none was selected. |
| `audit_resource_identifier` | Existing MAS association; empty if missing or longer than the existing 128-character column. Never store a truncated association. |
| `success` | True if the whole captured processing flow completed without an operational error. A completed DENY/BLOCK is successful. This is not audit-write success. |
| `audit_information` | CFN disposition details below. Historical records and other producers can have different JSON shapes. |

The source migration preserves historical records, backfills their known CFN producer,
and keeps a permanent database default of `CFN` for older CFN writers. New application
writes reject an empty or whitespace-only producer. Producer identities are not a closed
CFN-only enum. No Proxy ingestion endpoint or Proxy event writer is included.

## CFN disposition details

| Field | Meaning |
| --- | --- |
| `action` | Always `get_disposition`, naming the operation being audited. |
| `mas_id`, `source_agent_id`, `destination_agent_id` | Existing request identifiers. |
| `trace_id`, `span_id` | Original request correlation, subject to the capture bounds below. |
| `ce_name`, `ce_version` | Optional snapshots from the selected CE's existing Management association. |
| `ce_invoked` | True immediately before attempting Evaluate, false for connection and other earlier failures. |
| `outcome` | Actual CE decision, or `ERROR` for an operational failure. ERROR is not policy DENY. |
| `reason` | Actual CE reason or operational explanation. Evaluate errors retain the original client error text; earlier failures use the returned status message. |
| `grpc_status` | Actual handler status, including `OK`. |
| `returned_action`, `returned_modify` | Actual response values; omitted on a gRPC error. False `returned_modify` is retained. |
| `failure_category` | Stable category below; absent on a completed response. |
| `eligibility_counts` | On failed selection, counts of `disabled`, `offline` and `no_enforcing_endpoint`, using each CE's first exclusion reason. |
| `ce_response` | Optional allowlisted response details. |
| `truncated_fields` | Field paths shortened or omitted by capture limits. |

New records use `ce_response` regardless of whether the CE sends the legacy
response fields or the optional new `details` object. Historical records retain
`ce_details` and their original omission paths. Both are keys in the existing
`audit_information` JSONB column. Reads and UI JSON presentation preserve either
shape; no database schema migration or historical rewrite is performed.

There is no new `action_id`, request validation, JSON `ce_id`, or CE metadata RPC.
The CE ID retains its existing top-level resource field. CE name/version are historical
snapshots, and readers do not reconstruct missing historical values from current inventory.

## Operational failures

All failures have `success: false`, `outcome: ERROR` and their actual returned gRPC
status. Returned actions are absent. CFN preserves its existing status/message mapping.

| Path | Failure category | Event type |
| --- | --- | --- |
| Missing payload or required identifier | `INVALID_REQUEST` | `CE_NOT_INVOKED` |
| Missing workspace or Management URL | `CFN_CONFIGURATION_ERROR` | `CE_NOT_INVOKED` |
| MAS missing | `MAS_NOT_FOUND` | `CE_NOT_INVOKED` |
| Management lookup fails | `MANAGEMENT_LOOKUP_FAILED` | `CE_NOT_INVOKED` |
| No associated CASA CE | `NO_ASSOCIATED_CE` | `CE_NOT_INVOKED` |
| All candidates disabled | `CE_DISABLED` | `CE_NOT_INVOKED` |
| All candidates excluded as offline | `CE_OFFLINE` | `CE_NOT_INVOKED` |
| All enabled, online candidates lack enforcing URL | `CE_NO_ENFORCING_ENDPOINT` | `CE_NOT_INVOKED` |
| Mixed eligibility exclusions | `NO_ELIGIBLE_CE` | `CE_NOT_INVOKED` |
| Selected CE connection fails | `CE_CONNECTION_FAILED` | `CE_NOT_INVOKED` |
| Evaluate fails | `CE_EVALUATION_FAILED` | `CE_INVOKED` |

A single-cause selection category applies only when its count covers all candidates.
The existing returned disabled/offline message can be incomplete for mixed exclusions;
the audit preserves it and separately exposes the accurate counts. Skipped candidates
do not become a selected CE.

## Capture limits

Constants live in `pkg/audit/disposition.go`; no environment settings are added.

| Content | Limit |
| --- | --- |
| Each captured request identifier and the CE's echoed trace ID | 256 UTF-8 bytes |
| Main policy or operational `reason` | 8 KiB (8192 UTF-8 bytes) |
| Checks | First 50 |
| Each `check_id` | 128 UTF-8 bytes |
| Optional `ce_response` object | 16 KiB of encoded JSON |

Text truncation preserves UTF-8 boundaries and marks the affected field path. The
main reason and request identifiers are bounded before encoding new records.
Reads return stored values without another truncation step. Historical values are
not shortened and no SQL length constraint is added to JSONB.

`ce_response` captures supplied legacy `denial_reason`, `missing_context_cause`,
`context_sufficiency`, CE `timestamp`, echoed `trace_id`, and checks' `check_id` and
`passed`. Explicitly present UNSPECIFIED enums are retained; absent default values
from older bindings are not invented. It can also contain optional CE-owned JSON
under `ce_response.details`, as described in the [CE response contract](ce-evaluation-response.md).
Encoded JSON size includes escaping. If necessary, omit the new details object
first, then timestamp, echoed trace ID, and trailing checks until the envelope
fits, marking each affected path. Empty check lists are never sliced.

New details are snapshotted and checked for protojson and PostgreSQL jsonb
compatibility before attachment. Invalid JSON values (NaN/Inf) or actual U+0000
in any decoded string/key cause omission of the whole new object, an omission
marker and a logged warning; the core record and handler result survive. Literal
backslash-u0000 text is valid. Serialization errors are handled explicitly.
An exhausted trimming fallback omits the optional envelope instead of panicking.

The legacy capture path does not copy arbitrary request `extra`, raw conversation/tool
content, `modified_action` values or legacy per-check free-text reasons. The opt-in
CE-owned `details` object is captured as a bounded object and can contain the CE's
own explanations, including the Demo CE's check reasons. Its contents and the main
reason are protected by the existing audit access boundary; truncation is not
redaction. The UI renders reasons and JSON as text.

## Example: evaluated CASA denial

This excerpt omits unchanged row IDs, actors and timestamps:

```json
{
  "source": "CFN",
  "resource_type": "COGNITION_ENGINE",
  "resource_identifier": "ebc9f43a-05da-4cb1-8575-7bc43de4ad61",
  "audit_type": "CE_INVOKED",
  "audit_resource_identifier": "fa7c634b-38a1-4ad0-aeb6-ffda79c7b6cb",
  "success": true,
  "audit_information": {
    "action": "get_disposition",
    "mas_id": "fa7c634b-38a1-4ad0-aeb6-ffda79c7b6cb",
    "source_agent_id": "planner",
    "destination_agent_id": "booking",
    "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
    "span_id": "00f067aa0ba902b7",
    "ce_name": "CASA",
    "ce_version": "1.0.0",
    "ce_invoked": true,
    "outcome": "DECISION_DENY",
    "reason": "The requested tool is outside the allowed task.",
    "grpc_status": "OK",
    "returned_action": "ACTION_BLOCK",
    "returned_modify": false,
    "ce_response": {
      "denial_reason": "DENIAL_REASON_DEVIATES_FROM_INTENT",
      "checks_run": [{"check_id": "TOOL_ALLOWED", "passed": false}]
    }
  }
}
```

## Persistence, readers and rollout

The handler finalizes one record from the actual response/error. Audit data is
snapshotted before the asynchronous write. The write uses a context independent of
caller cancellation, logs failures and participates in the existing shutdown wait.
An unavailable writer, database outage or process crash can lose records; this is
best-effort persistence, without a durable queue or a change to enforcement behavior.

CFN's existing audit read endpoints return the enriched entity. Management forwards
the JSON and publishes optional source/success fields to tolerate older CFN versions.
Both CFN event types retain their existing MAS association semantics in the UI.
The audit panel has top-level Decision (All, Allow, Block (Deny), Modify) and Status
(All, Success, Failed) filters. Decision matches the recorded CFN policy outcome;
Block matches DECISION_DENY, whose returned action is ACTION_BLOCK. Status matches
the whole-flow success flag, so a completed policy block can match Success. Missing
historical statuses are included only by All. The UI sends optional decision
(allow/block/modify) and success (true/false) query parameters through Management to
CFN. Apply them together with existing API filters before counting and pagination,
so older matching records can be found. All omits the corresponding query parameter.
Changing these filters resets pagination; automatic refresh retains their selections.
Clear filters and reopening the panel reset both to All. Trace summaries count
loaded records matching the active filters.
Display the audit list in one table with a single sticky column header. Add a
"Group by Trace ID" switch, reset to off whenever the panel opens, right-aligned beside the panel's
"View audit logs and actions for ..." description. Switching modes preserves filters,
pagination, individual JSON expansion, group collapse state and incoming-item deadlines.
With grouping disabled, render all loaded matching events globally newest first
by their stored timestamps, including events from interleaved traces. Add a fixed-width
Trace ID column immediately after Timestamp (UTC), with a shortened value, full-value
tooltip and copy control. Display N/A for missing, blank or explicitly truncated
trace IDs. Use MM/dd/YY HH:mm:ss in UTC in flat mode, retaining the full four-digit
year in the tooltip. Narrow the timestamp column to 9rem and use the saved space
for the agent columns; grouped timestamps retain 10.5rem and MM/dd/YYYY HH:mm:ss.
Retain the same table width. Hide all trace dividers, group summaries and group
expand/collapse chevrons; retain per-item JSON controls. Other sources use neutral
source rows and their full JSON in this mode, without interpreting CFN payload fields.
With grouping enabled, group loaded
items with the same exact trace_id under a full-width divider row with a subtle
neutral background, without trace or nested item cards. Separate items by one
horizontal line and keep independent JSON expansion for each item. Use fixed column
widths for timestamp, CE, decision/result, source agent, destination agent and the
expansion control. Do not prefix destination values with an arrow.
Show grouped display timestamps in UTC as MM/dd/YYYY HH:mm:ss, including seconds and using
24-hour time. Flat mode uses MM/dd/YY HH:mm:ss. Keep the timestamp column wide enough for the complete value and
never truncate it. Label the column "Timestamp (UTC)". Keep each row on one line,
truncate other overflowing text with an ellipsis and expose its full value in a
tooltip. On narrow screens, scroll the table horizontally rather
than wrapping the row or changing column widths.
The trace divider shows a shortened trace ID with an always-visible copy icon that
copies the complete stored ID, plus nonzero item counts for ALLOW, DENY, MODIFY and
ERROR. Hide zero counts. Show Other when there are unknown results or other producers;
do not assume that those producers use the CFN payload. A failed CFN flow counts
only as ERROR; a completed policy DENY counts as DENY. Counts describe the loaded
items in the current view; show the total as "Σ: N",
with the loaded scope explained in its tooltip while more pages exist.
Each divider has a chevron in the rightmost control column, aligned with the
per-item controls, that collapses or expands all rows in that trace.
The table header has a matching chevron to the right of Destination agent that
collapses all loaded trace groups when all are expanded, or expands all when any
are collapsed. Disable it when there are no trace groups. Individual JSON expansion
state is retained through this bulk action.
Groups start expanded. A collapsed group keeps its divider and summary visible;
retain group collapse and individual JSON expansion state across refreshes and
loading more pages. Reopening the audit panel starts with all groups expanded.
Copied confirmation checkmarks for trace IDs and audit JSON use black.
Trace lifecycle status and execution duration are unavailable from these audit
records, so the trace divider has no duration display.
Loading more merges additional events into the existing trace group and updates its
summary. Order trace groups by their newest item and retain newest-first item order.
Records with missing, blank or explicitly truncated trace IDs remain individual
entries without a trace divider so unrelated requests are not combined.
While the audit panel is open, refresh all loaded pages automatically every
CFN_UI_AUDIT_REFRESH_INTERVAL_SECONDS (default 30 seconds; 0 disables polling).
The UI server supplies this setting through its runtime configuration endpoint;
invalid or out-of-range timer values fall back to 30 seconds. For source tasks,
set it in the CFN .env and restart the UI, then reload the browser page.
Polling pauses when the panel is closed, the tab is hidden or the browser is
offline. Preserve pagination depth and expanded item state during refresh. Deduplicate
event IDs across page boundaries so concurrent inserts do not inflate trace counts.
Failed refreshes continue retrying at the configured interval, without overlapping
scheduled refreshes, so the open panel can recover after a backend outage.
Once a page has loaded successfully for the current query (including an empty page),
keep the cached rows or empty view visible during refreshes and Load more requests
and failures. Keep the scroll container, table and expanded JSON mounted. Show an
inline "Could not update audit events. Showing previously loaded data." note with
a Retry control after an error; say "Retrying automatically" only when auto-refresh
is enabled. Use the full loading/error screen only before the first successful page.
Distinguish active requests from a requested page missing after failure: stop the
Load more spinner once the request settles and keep retry usable. If a page remains
missing, Load more retries the current requested window without incrementing its size.
Manual retry/reset/load-more rejections are exposed through SWR without unhandled
promise rejections. Keep loaded state scoped to the current query, independently of
the number of displayed MAS rows. Other users of ConditionalSWRRenderer retain their
existing behavior.
When auto-refresh discovers a previously unseen audit ID, pulse the corresponding
trace divider's background in grouped mode, or only that new event's row in flat mode,
for CFN_UI_AUDIT_FLASH_DURATION_SECONDS (default 60
seconds; 0 disables the cue). This setting uses the same runtime configuration and
CFN .env source path as the refresh interval. Invalid timer values fall back to 60.
Each trace has its own expiry, so several headers can flash simultaneously; another
incoming item restarts that trace's expiry. Keep the cue visible for collapsed
groups. Track each incoming event's own expiry as well, so switching modes retains
active cues and existing rows in the same trace do not flash in flat mode. The
expanded JSON retains its normal styling. Initial loads, opening/changing filters
or MAS and newly loaded pagination pages
seed the seen-ID baseline quietly. Deduplicate IDs across pages before notifying
the view. Keep incoming IDs pending through partial refresh failures and start
their deadlines when their refreshed rows become visible; drop pending IDs outside
the published window so loading older pages stays quiet.
Preserve independent deadlines through polling and Load more; clear them
on close or filter/MAS changes. Remove each cue when its own duration expires.
Honor reduced-motion preferences with a steady highlight for the same duration.
The cue represents incoming audit items and does not establish a trace lifecycle.
The UI selects the presentation by source. CFN disposition rows show, in order,
timestamp, plain CE name, decision/result, and recorded source_agent_id and
destination_agent_id in separate columns. Show the recorded CE name when available;
if absent or blank but resource_identifier is present, show a shortened CE ID with
full-value tooltip and copy control. Fit the text and control inside the fixed CE
column. This also applies to historical rows and older Management responses, without
looking up today's CE inventory. Show N/A only when no CE name or ID is available. No CFN producer badge,
CE or agent badges, persistent outcome backgrounds or error outlines are used.
Both group summaries and item decisions use a single colored SVG icon followed
by neutral text (black in the light theme), without a badge: ALLOW uses a green
circle check, DENY a red circle minus, MODIFY an amber circle pencil and ERROR a
red triangle exclamation. Unknown results use a neutral circle question icon and
do not imply a policy result. Shared badge variants used elsewhere are unaffected.
For other or missing sources in a trace, show the source in place of the CE,
classify the result as Other and leave CFN agent fields unavailable; their full
record remains in the JSON. Untraced non-CFN records keep their generic display.
If success=false or outcome=ERROR, show Error in place of the decision, using its
triangle icon. Keep the actual gRPC status and reason in the result tooltip and
the JSON. Unavailable historical success values alone do not imply a failure.
A completed policy DENY remains Deny rather than a processing Error.
The expanded JSON panel always uses the standard neutral background, border and
syntax colors. Expanding a row shows the complete audit record through the existing JSON
renderer, including CE ID, reason, returned disposition, correlation and structured
details. Each expanded record has a copy icon that copies the complete formatted
JSON shown in that view as plain text, with brief copied feedback and a visible
error if clipboard access fails. Do not duplicate those details in an always-visible table. Load more stays
reachable while the server has more rows, including pages with no matching MAS rows.

Deploy **Management → CFN → UI**. Old CFN rejects the new `CE_NOT_INVOKED` filter
with HTTP 400; Management preserves that error. Old CFN also ignores unknown
decision/success query parameters. Enable these UI filters only after both Management
and CFN support them; disable them before rolling either service back. Historical missing fields
remain unavailable, with no fabricated results or inferred producer at read time.

# CFN disposition audit semantics

**Scope:** CFN-produced GetDisposition audit records, issue #34.

**Guidance:** Preserve resource_identifier as the selected CE ID and
audit_resource_identifier as the MAS association. Keep CE_INVOKED for Evaluate
attempts, including errors, and CE_NOT_INVOKED for earlier failures. Both carry
action=get_disposition. A completed policy DENY/BLOCK has success=true; operational
failure has success=false. Never put a truncated MAS ID in the association column.
The source field identifies the producer, separately from the deciding CE.
Shared Outcome and Status filters run in CFN before pagination through optional
outcome and success=true/false parameters forwarded by Management. The legacy
decision=allow/block/modify aliases now use the same canonical outcomes across
producers, as specified in [Proxy audit ingestion](../specs/proxy-audit-ingestion.md).
Block matches the CE DENY outcome; status uses whole-flow success, so
a completed policy block matches Success. Missing status values match only All.
Filter changes reset pagination, refresh preserves selections, and Clear filters
or reopening reset them. Trace summaries describe loaded, matching records.
Select UI presentation by source. CFN disposition rows show timestamp, CE name,
decision and recorded source/destination agents in separate columns, without an
arrow before the destination. Omit producer, CE and agent
badges. Prefer the recorded CE name; if missing/blank, show a shortened, copyable
resource_identifier with a full-value tooltip, including historical rows and older
Management responses. N/A means neither CE name nor ID is available. Constrain
the fallback text and preserve its copy icon inside the fixed CE column; never
reconstruct missing names from today's inventory. Keep details in collapsed JSON with its
standard neutral background and syntax styles. Processing failure (success=false
or outcome=ERROR) replaces the decision with Error; a completed policy DENY displays
the common Block label. Filters, rows and trace summaries share labels across
producers; original decisions remain in JSONB. Use colored icons and neutral text
(black in the light theme) for both item results and group counts: green circle
check for Allow, red circle minus for Block, amber circle pencil for Modify requested
and red triangle exclamation for Error. Unknown
results use a neutral circle question icon. No decision badges or persistent backgrounds
based on outcome.
Use one table with a single sticky column header. Put items with the same exact
trace ID under a full-width neutral divider row, without trace or nested item cards.
Grouping resets to off every time the panel opens, including after closing with
grouping enabled. Reset it in the open handler before showing the panel; a useState
initializer alone does not reset state on reopening. Put the switch right-aligned beside the
panel description. Style its track with explicit HSL theme variables and its thumb
with bg-white: the current Tailwind v4 stylesheet does not emit the legacy bg-primary,
bg-background or bg-muted-foreground utilities from tailwind.config.ts, making them
transparent. Do not enable the entire legacy theme configuration as an incidental
switch fix. With it off, render every loaded matching event in global newest-first
timestamp order, add a truncated/copyable Trace ID column after Timestamp (UTC),
and hide dividers, summaries and all group chevrons. Missing/blank/explicitly truncated
trace IDs display N/A. Other sources use neutral source rows with full JSON.
Keep the table width unchanged. Flat mode uses MM/dd/YY HH:mm:ss in UTC, with a 9rem
timestamp column and the saved space given to the agent columns. Keep the four-digit
year in its tooltip. Grouped mode retains MM/dd/YYYY HH:mm:ss and 10.5rem.
Switching modes preserves filters, pagination, JSON expansion, group collapse
and activity deadlines.
Use fixed columns and single-line item rows separated by one line.
Display timestamps in UTC with 24-hour time and seconds, using MM/dd/YY HH:mm:ss
in flat mode and MM/dd/YYYY HH:mm:ss in grouped mode.
Never truncate the timestamp column; reserve enough width for the full value.
Label the column "Timestamp (UTC)". Ellipsize overflow
in other columns and provide full-value tooltips; scroll horizontally on narrow
screens. Keep independent JSON expansion. Other producers in a trace use source
in place of CE, count as Other and do not borrow CFN payload semantics.
Each expanded row has a copy icon for its entire displayed JSON, without copying
syntax markup or truncating values. Report clipboard failures without claiming success.
Copy the full trace ID even when its label is shortened.
Copy confirmation checkmarks for trace IDs and JSON are black. Place each trace
divider's chevron in the rightmost control column, aligned with per-item controls.
It collapses/expands that group's rows, with groups expanded initially.
The rightmost table-header chevron controls all loaded trace groups: collapse all
when all are expanded; otherwise expand all. Disable it if there are no groups.
Preserve individual JSON expansion state during this action.
Keep the header summary visible when collapsed; preserve group collapse and
per-item JSON expansion through refresh and pagination. Reopening resets groups.
Summaries count loaded items only, with processing errors separate from policy
BLOCK, with unknown results counted as Unknown and unrelated events as Other.
Missing or truncated trace IDs do not
group unrelated requests. Loading additional pages merges items into their trace.
Show the count as Σ: N and explain the loaded scope in its tooltip. Hide zero outcome
counts rather than showing colored icons for absent results. Audit records
do not establish trace open/closed state, so omit trace duration and its calculation.
The open panel refreshes all loaded pages using the runtime setting
CFN_UI_AUDIT_REFRESH_INTERVAL_SECONDS (default 30, 0 disables), while visible and
online. Keep pagination depth and expanded item state, and deduplicate repeated
event IDs at page boundaries before computing summaries.
Retain the current query's successfully loaded data, including successful empty
pages, during refresh/Load more requests and failures. Keep the table and scroll
container mounted. Show an inline update failure note with Retry; mention automatic
retries only when polling is enabled. Reserve the full loading/error screen for
before the first successful page. Track actual network validation separately from
a requested page that is still missing after failure: stop its spinner when the
request settles and have Load more retry the same window without incrementing size.
Catch UI-triggered mutate/setSize rejections while retaining SWR's error state.
Keep these behaviors local to the audit panel/hook; do not change shared renderer
semantics for other callers.
With auto-refresh enabled, newly discovered audit IDs pulse their trace headers
in grouped mode or only the corresponding new event rows in flat mode
for CFN_UI_AUDIT_FLASH_DURATION_SECONDS (default 60, 0 disables). Track independent
deadlines for every affected trace, resetting only a trace receiving another item.
Several headers can pulse together, including collapsed groups. Initial loads,
filter changes and new pagination pages stay quiet. Clear cues on close or filter/MAS changes;
preserve deadlines during refresh and Load more. Reduced motion uses a steady
highlight. Keep independent per-event deadlines as well as per-trace deadlines,
so toggling grouping preserves the active cues without highlighting old event rows
in the same trace. Expanded JSON keeps its standard styling. Retain pending incoming IDs
across partial refresh failures and start
their durations once refreshed rows are visible; discard pending IDs outside the
published window. This indicates incoming audit items without implying trace open/closed.

**Why:** These meanings were explicitly confirmed during the issue #34 plan review.
The enhancement preserves existing resource and evaluated-event semantics while
adding previously unaudited request paths. Proxy ingestion remains separate work.

**Evidence:** [Issue #34](https://github.com/cisco-eti/ioc-scale-cfn-svc/issues/34),
[approved plan](../plans/audit-upgrades.plan.md) and
[audit contract](../specs/disposition-audit.md).

**Revisit when:** A separately approved producer or audit-contract change alters
these fields; adding a new producer alone does not repurpose existing CFN fields.

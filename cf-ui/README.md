# Internet of Cognition (IOC) - Cognition Fabric Node (CFN) Management UI

Cognition Fabric Node Management UI Service.

## Tech Stack

- **Next.js 15.5.6** - React framework with App Router
- **TypeScript** - Type safety
- **shadcn/ui** - UI components built on Radix UI
- **Tailwind CSS 4** - Styling
- **SWR** - Data fetching and caching by Vercel
- **Zustand** - State management

## Setup

### Prerequisites

- Node.js >= 20.9.0 (Node 20 is the repository default in `.nvmrc`)
- npm compatible with your Node.js version

## Development

Use the repository root's [`.env.example`](../.env.example). Its Management UI
section contains authentication and audit display settings. Follow the
[local workflow](../dev/README.md) for infrastructure and Management startup.

From the repository root, create `.env`:

```bash
cp .env.example .env
```

Generate a `NEXTAUTH_SECRET` and put it in root `.env`:

```bash
openssl rand -base64 32
```

Use the Node version in [`.nvmrc`](.nvmrc). From the repository root, install
the locked dependencies:

```bash
npm --prefix cf-ui ci
```

Once Management is ready, run the development server from the repository root:

```bash
task run:cf-ui
```

Open [http://localhost:9001](http://localhost:9001)

### Timestamp display

CF API timestamps identify UTC instants. The UI accepts RFC 3339 timestamps with
an explicit `Z` or numeric offset and displays absolute dates in UTC, labelled
with the timezone. Shared formatters also accept an explicit display timezone;
relative times and sorting use the same instant in every browser timezone.
Missing, malformed or timezone-less API values show the existing placeholders.
Raw metadata and audit JSON remain unchanged.

### Audit panel refresh

The Group by Trace ID switch beside the panel description resets to off every
time the panel opens, showing a
global newest-first event list with a copyable Trace ID column. Flat timestamps use
MM/dd/YY HH:mm:ss in UTC; grouped mode uses MM/dd/YYYY HH:mm:ss. Filters, pagination
and expanded JSON are preserved when switching modes.
If a recorded CE name is unavailable, the CE column shows its shortened, copyable
stored CE ID; N/A means neither is available.

Set `CFN_UI_AUDIT_REFRESH_INTERVAL_SECONDS=30` in root `.env` to configure audit
auto-refresh (default: 30 seconds; `0` disables it). Use a nonnegative whole number
of seconds; invalid values fall back to 30. Restart the UI and reload the browser
page after changing it.

The open audit panel refreshes all loaded pages while the browser tab is visible
and online. It preserves pagination depth and expanded item state; trace summaries
update with the returned records. Closing the panel stops polling.
Refresh and Load more failures keep previously loaded data visible, with an inline
failure note and Retry control. Automatic retries are indicated only when enabled.
Retrying an unfinished page does not request an extra page. A successful empty
page is also retained; the full error screen is used only before any page loads.

When an automatic refresh finds a new item, its trace header pulses in grouped mode;
in flat mode, only the new event row pulses. Both use
`CFN_UI_AUDIT_FLASH_DURATION_SECONDS` (default: 60 seconds; `0` disables the cue).
Set it alongside the refresh interval and restart the UI, then reload the browser.
Several trace headers or new rows can pulse at once, each with its own deadline.
Another new item restarts that trace's duration. Collapsed groups keep flashing
in their header. Switching grouping preserves the remaining cue durations.
The duration starts when refreshed rows become visible, including after a failed
refresh recovers.
Initial loading, filter changes and Load more do not trigger the cue. Reduced-motion
preferences use a steady highlight for the same period. This indicates incoming
audit items, without implying that a trace has opened or closed.

### Docker

To run the published UI image against the local stack, use the root task:

```bash
task run:cf-ui:image
```

This task reads authentication settings from root `.env` and selects the
container-to-Management address. Audit refresh and flash settings above apply to
the source UI; the image task uses the selected image's defaults.

## Authentication

Use these below to login:

- **Username**: `admin`
- **Password**: `admin`

## Build

From the repository root:

```bash
npm --prefix cf-ui run build
```

## License

This project is licensed under the Apache License, Version 2.0 - see the [LICENSE.md](../LICENSE.md) file for full details.

Copyright (c) 2024-2026 Cisco Systems, Inc. and its affiliates. All rights reserved.

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at:

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

## Third-Party Notices

This project uses third-party open source components. See [THIRD-PARTY-NOTICES](../THIRD-PARTY-NOTICES) for copyright and license information.

## MAS metadata onboarding

Create and edit accept the full Management request as JSON. Form edits preserve
opaque rich metadata, omit unchanged graph/inventory fields and send explicit
clears. The fifth Topology tab displays the stored provided graph with directed
relationships and optional Start/End markers. Agent nodes follow the fabric view:
circular nodes, a dashed outline on hover/selection, and a right-hand Inspect
panel on click. The panel shows the selected agent’s details and only its assigned
tools; nodes do not expand. Pan, zoom and fit controls use the fabric canvas
palette; a text view provides the node and relationship list. The matching
highlighted, collapsible JSON remains copyable alongside the graph.
The layout follows directed graph layers, separates return relationships and
places disconnected nodes below the connected graph without adding edges.

Provided and Observed are independent sources. An absent graph differs from an
explicitly empty graph; disabled/unavailable sources show their own status without
substituting another graph or blocking other MAS information. Observed remains
disabled until the optional source integration is connected; this UI makes no
OXP/CFN requests. In edit mode the graph is replaced by provided-topology JSON
using the existing Save/Cancel flow. Browsing never writes metadata or node
positions, and background refresh failures retain loaded data and unsaved edits.
See the [CFN metadata contract](../docs/discussions/0006-mas-onboarding-metadata.md)
and [NOA pasteable declaration](../samples/noa-trip-planner/mas/README.md).

Generate Management API types with `npm run generate:api`; `npm run check:api` compares without rewriting files. Both consume the committed [canonical schema](../api/mgmt/openapi/openapi.json), so no running Management service is needed. `CFN_UI_API_BASE_URL` continues to configure application requests and image builds.

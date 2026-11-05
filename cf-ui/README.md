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

Copy the example environment file:

```bash
cp .env.example .env.local
```

Optionally, generate your own `NEXTAUTH_SECRET`:

```bash
openssl rand -base64 32
```

If you use nvm, select the repository's Node version:

```bash
nvm install
nvm use
```

Install the locked dependencies:

```bash
npm ci
```

Run dev server:

```bash
npm run dev
```

Open [http://localhost:9001](http://localhost:9001)

### Audit panel refresh

The Group by Trace ID switch beside the panel description resets to off every
time the panel opens, showing a
global newest-first event list with a copyable Trace ID column. Flat timestamps use
MM/dd/YY HH:mm:ss in UTC; grouped mode uses MM/dd/YYYY HH:mm:ss. Filters, pagination
and expanded JSON are preserved when switching modes.
If a recorded CE name is unavailable, the CE column shows its shortened, copyable
stored CE ID; N/A means neither is available.

Set `CFN_UI_AUDIT_REFRESH_INTERVAL_SECONDS=30` in `.env.local` to configure audit
auto-refresh (default: 30 seconds; `0` disables it). Use a nonnegative whole number
of seconds; invalid values fall back to 30. When using `task run:cf-ui`, set this
in the CFN repository's `.env` instead. Restart the UI and reload the browser page
after changing it.

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

Alternatively, run with Docker:

```bash
docker-compose up --build
```

For this Compose setup, set `CFN_UI_AUDIT_REFRESH_INTERVAL_SECONDS` and
`CFN_UI_AUDIT_FLASH_DURATION_SECONDS` in the UI repository's `.env`; Compose forwards
them to the container at runtime.

## Authentication

Use these below to login:

- **Username**: `admin`
- **Password**: `admin`

## Build

```bash
npm run build
npm start
```

## License

This project is licensed under the Apache License, Version 2.0 - see the [LICENSE.md](LICENSE.md) file for full details.

Copyright (c) 2024-2026 Cisco Systems, Inc. and its affiliates. All rights reserved.

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at:

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

## Third-Party Notices

This project uses third-party open source components. See [THIRD-PARTY-NOTICES](THIRD-PARTY-NOTICES) for copyright and license information.

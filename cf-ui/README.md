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

### Docker

Alternatively, run with Docker:

```bash
docker-compose up --build
```

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

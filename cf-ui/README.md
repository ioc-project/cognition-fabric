# ioc-cfn-mgmt-plane-ui

Cognitive Fabric Node Management UI Service

## Tech Stack

- **Next.js 15.5.6** - React framework with App Router
- **TypeScript** - Type safety
- **shadcn/ui** - UI components built on Radix UI
- **Tailwind CSS 4** - Styling
- **SWR** - Data fetching and caching by Vercel
- **Zustand** - State management

## Setup

### Prerequisites

- Node.js >= 13.8.0
- npm >= 6.14.4

## Development

Copy the example environment file:

```bash
cp .env.example .env.local
```

Optionally, generate your own `NEXTAUTH_SECRET`:

```bash
openssl rand -base64 32
```

Install dependencies:

```bash
npm install
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

# Internet of Cognition (IOC) - Cognition Fabric Node (CFN) Management Backend Service

[![Docker](https://img.shields.io/badge/docker-ghcr.io-blue?logo=docker)](https://github.com/orgs/cisco-eti/packages/container/package/ioc-scale-cf-mgmt-svc)
[![GitHub Pages Site](https://img.shields.io/badge/GitHub%20Pages-Visit-green?logo=github)](https://scaling-potato-qm8j7n7.pages.github.io/)

IoC CFN Management Backend Service - FastAPI backend for workspaces, users, API keys, Cognitive Fabric Nodes, and Multi-Agentic Systems

## Prerequisites

- Python 3.10+
- Poetry: `curl -sSL https://install.python-poetry.org | python3 -`
- Task:
  - **macOS**: `brew install go-task`
  - **Linux**: `apt install task`, `dnf install go-task`, or `snap install task --classic`
  - **Cross-platform**: `npm install -g @go-task/cli`
  - **Go users**: `go install github.com/go-task/task/v3/cmd/task@latest`
  - **Manual install**: `sh -c "$(curl --location https://taskfile.dev/install.sh)" -- -d -b ~/.local/bin`

### Environment Configuration

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Edit `.env` to set your configuration values:

```bash
vi .env  # or use your preferred editor
```

### Dependencies for the Relational DB

For details please refer to the [README](src/server/database/relational_db/README.md)

- [PostgreSQL 17 Alpine](https://hub.docker.com/_/postgres)
- [Atlas](https://atlasgo.io/guides/orms/sqlalchemy/getting-started)

## Quick Start

### Full Stack Deployment

For full stack deployment (all services), see [ioc-scale-cf-deployment](https://github.com/cisco-eti/ioc-scale-cf-deployment).

### Local Development

Requires PostgreSQL running locally. You can start one with Docker:

```bash
docker run -d --name postgres-cfn \
  -e POSTGRES_USER=postgresUser \
  -e POSTGRES_PASSWORD=postgresPW \
  -e POSTGRES_DB=cfn_mgmt \
  -p 5433:5432 \
  postgres:17-alpine
```

Then run the service:

```bash
task run    # installs deps, applies db migrations, then runs
```

Or with Poetry directly:

```bash
poetry install
task dev
```

**API Documentation:** http://localhost:9000/docs

After applying migration `0007`, restart the intended CE if multiple enabled registrations share
an endpoint. See [CFN's CE lifecycle contract](https://github.com/cisco-eti/ioc-scale-cfn-svc/blob/main/docs/CE-LIFECYCLE.md#endpoint-ownership)
for ownership, reconnect, and version compatibility details.

Migration `agent_identity_0008` changes the agent storage key. Stop older Management writers for
the target database before applying it; this is an application/key
cutover, not a mixed-version rolling upgrade. Existing runtime agent IDs remain
unchanged, and Management reads add a read-only `cf_agent_id` UUID. See the
[agent identity migration and manual checks](docs/DATABASE_MIGRATIONS.md#agent-storage-identity-agent_identity_0008).

### Encryption Keys

Memory provider credentials are encrypted using a Fernet key. The key is automatically generated on first run and stored in `.secrets/encryption.key` (gitignored). Each developer gets a unique key.

## Development

**Using Task**

```bash
task dev              # Start development server with hot reload
task test             # Run all tests
task lint             # Fix linting issues
task docker-build     # Build Docker image
```

**Using Poetry directly**

```bash
cd src
poetry run python -m server.main
```

## API Endpoints

**API Documentation:** http://localhost:9000/docs

**IAM (Identity and Access Management):**

- API Keys: `GET|POST|DELETE /api/iam/api-keys`
- Users: `GET /api/iam/users`
- Roles: `GET /api/iam/roles`

**Workspaces:**

- Workspaces: `GET|POST|PUT|DELETE /api/workspaces`
- Workspace Members: `GET|POST|DELETE /api/workspaces/{workspace_id}/members`
- Workspace Invitations: `GET|POST|DELETE /api/workspaces/{workspace_id}/invitations`

**Workspace Resources:**

- Multi-Agentic Systems: `GET|POST|DELETE /api/workspaces/{workspace_id}/multi-agentic-systems`
- Cognitive Fabric Nodes: `GET|POST|PUT|DELETE /api/workspaces/{workspace_id}/cognitive-fabric-node`

**CFN Audit Events** (from `cfn_cp` database):
- List all events: `GET /api/audit-events`
- Filter events: `GET /api/audit-events?resource_type=COGNITION_ENGINE&audit_type=CE_INVOKED`
- Filter shared outcomes and operational status: `GET /api/audit-events?outcome=BLOCK&success=true`
- Filter Proxy records: `GET /api/audit-events?audit_type=PROXY_MEDIATED`
- Legacy `decision=allow|block|modify` aliases also filter canonical outcomes across producers.

The optional top-level `outcome` supplements the preserved source details in
`audit_information`. See the [CF-owned audit contract](https://github.com/cisco-eti/ioc-scale-cfn-svc/blob/main/docs/specs/proxy-audit-ingestion.md)
for outcome mappings, delivery requirements and rollout.
- Get event by ID: `GET /api/audit-events/{id}`

```bash
# List all CFN audit events
curl http://localhost:9000/api/audit-events/

# Filter by resource_type and audit_type
curl "http://localhost:9000/api/audit-events/?resource_type=COGNITION_ENGINE&audit_type=CE_INVOKED"

# Successful policy blocks; optional filters run in CFN before pagination
curl "http://localhost:9000/api/audit-events/?decision=block&success=true"

# Get a specific audit event by UUID
curl http://localhost:9000/api/audit-events/5bda66e6-1608-4f83-b7e4-aadbddce312c
```

**Other:**

- Audit Logs: `GET /api/audits`

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE.md](LICENSE.md) file for details.

## Third-Party Notices

This project uses third-party open source components. See [THIRD-PARTY-NOTICES](THIRD-PARTY-NOTICES) for copyright and license information.

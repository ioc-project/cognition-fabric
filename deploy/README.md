# ioc-scale-cf-deployment

Deployment configurations for the IOC Cognition Fabric stack.

## Quick Start

1. Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

2. Start the stack:
   ```bash
   docker compose up -d
   ```

## Services

| Service | Port | Description |
|---------|------|-------------|
| `ioc-knowledge-memory-svc-db` | 5456 | AgensGraph + PGVector database |
| `ioc-scale-cf-mgmt-svc` | 9000 | Management backend API |
| `ioc-cfn-svc` | 9002 (HTTP), 9009 (MCP) | Cognition Fabric Node |
| `ioc-cfn-cognition-engines` | 9004 | Cognition engines |

## Configuration

See `.env.example` for all available configuration options. Key settings:

- `IOC_KNOWLEDGE_DB_*` - Database credentials
- `ADMIN_USER_PASSWORD` - Admin password for mgmt backend


# TODO

Add other CF components (such as OXP) to this deployment when integration is done.

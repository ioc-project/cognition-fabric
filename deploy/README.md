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
| `ioc-scale-db` | 5456 | AgensGraph + PGVector database |
| `ioc-scale-cf-mgmt-svc` | 9000 | Management backend API |
| `ioc-scale-cfn-svc` | 9002 (HTTP) | Cognition Fabric Node |
| `ioc-scale-cfn-cognition-engine` | 9004 | Cognition engines |

## Configuration

See `.env.example` for all available configuration options. Key settings:

- `IOC_KNOWLEDGE_DB_*` - Database credentials
- `ADMIN_USER_PASSWORD` - Admin password for mgmt backend


# TODO

Add other CF components (such as OXP) to this deployment when integration is done.

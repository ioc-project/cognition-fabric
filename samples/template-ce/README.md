# CASA Cognition Engine

CASA (Continuous Agent Semantic Authorization) Cognition Engine Service.

**Note:** This is a **fake/mock CE** for testing and demonstration purposes.

## Features

- **POST /authorize** - Authorization endpoint that returns allow/block/modify decisions
- **CE Registration** - Automatically registers with CFN on startup (idempotent)
- **Heartbeat** - Sends periodic heartbeats to CFN to maintain "online" status
- **Graceful Degradation** - Runs standalone if CFN is unavailable

## Run Locally

```bash
# Install dependencies
uv pip install -e .

# Run server (standalone mode - no CFN registration)
cd src
python service.py
```

Server runs on http://localhost:8000

### Run with CFN Registration

To register with Cognition Fabric (CFN):

```bash
# Required: Set CFN URL
export CFN_URL="http://localhost:9002"

# Optional: customize CE configuration
export COGNITION_ENGINE_HOST="localhost"
export COGNITION_ENGINE_PORT="8000"
export CE_HEARTBEAT_INTERVAL_SEC="30.0"
export MAS_AUTO_ASSOCIATE="false"

# Run server
cd src
python service.py
```

On startup, the CE will:
1. Register with CFN at `$CFN_URL/api/cognition-engines`
2. Receive a `ce_id` (idempotent - same ID on subsequent starts)
3. Start heartbeat background task (every 30s by default)
4. Appear as "online" in Management Plane

## Test

```bash
# Install with test dependencies
uv pip install -e ".[test]"

# Run tests
uv run pytest
```

## API

- `POST /authorize` - Authorization endpoint
- `GET /docs` - API documentation

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CFN_URL` | CFN service base URL (e.g. "http://localhost:9002") | `""` (standalone) |
| `COGNITION_ENGINE_HOST` | Advertised host for this CE | `"localhost"` |
| `COGNITION_ENGINE_PORT` | Advertised port for this CE | `"8000"` |
| `CE_HEARTBEAT_INTERVAL_SEC` | Heartbeat interval in seconds | `"30.0"` |
| `MAS_AUTO_ASSOCIATE` | Auto-associate CE with all MAS | `"false"` |
| `LOG_LEVEL` | Logging level | `"INFO"` |

## Architecture

### Registration Flow

```
┌─────────────────┐
│   CASA CE       │
│  (startup)      │
└────────┬────────┘
         │
         │ 1. POST /api/cognition-engines
         │    {cfn_id, ce_type, base_url, endpoint}
         ▼
┌─────────────────┐
│      CFN        │
│  (forwards to   │
│  Mgmt Plane)    │
└────────┬────────┘
         │
         │ 2. Forward to Management Plane
         ▼
┌─────────────────┐
│  Management     │
│    Plane        │
│  (generates     │
│   ce_id)        │
└────────┬────────┘
         │
         │ 3. Returns {ce_id, ce_type, status, ...}
         ▼
┌─────────────────┐
│   CASA CE       │
│  (stores ce_id, │
│   starts        │
│   heartbeat)    │
└─────────────────┘
```

### Idempotency

Registration is **idempotent**:
- First call: Management Plane creates new CE entry, returns `created: true`
- Subsequent calls: Management Plane returns existing `ce_id`, returns `created: false`
- Safe to restart CE multiple times - always gets the same `ce_id`

### Heartbeat

After successful registration, CASA CE sends periodic heartbeats:
- Endpoint: `POST /api/cognition-engines/{ce_id}/heartbeat`
- Interval: 30 seconds (configurable via `CE_HEARTBEAT_INTERVAL_SEC`)
- Keeps CE status as "online" in Management Plane
- Fire-and-forget (logs errors, never crashes)

### Graceful Degradation

If CFN is unavailable:
- Registration fails with warning log (not an error)
- CE continues to run in standalone mode
- `/authorize` endpoint works normally
- No heartbeats sent
- CE does not appear in Management Plane

## Files

- `src/service.py` - FastAPI app with `/authorize` endpoint
- `src/models.py` - Pydantic models for request/response
- `src/registration.py` - CE registration and lifecycle management
- `tests/` - Unit tests (40 tests covering models, API, registration)

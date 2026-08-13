# IOC Scale CF - Cognition Engines

Repository for Cognition Engines (CEs) - intelligent decision-making services for the IOC platform.

## Structure

```
ioc-scale-cf-cognition-engines/
├── engines/              # All cognition engines
│   └── casa/            # Example: CASA enforcement engine
│       ├── src/         # Python source code
│       ├── Dockerfile   # Container build
│       └── README.md    # Engine-specific docs
└── docker-compose.yml   # Run all services locally
```

## Quick Start

### Run All Engines

```bash
docker-compose up
```

### Run Specific Engine

```bash
docker-compose up casa-enforcement
```

### Stop Services

```bash
docker-compose down
```

## Available Engines

### CASA Authorization

**Location:** `engines/casa/`  
**Port:** 8001  
**Docs:** http://localhost:8001/docs  
**Type:** Gateway/Authorization CE (fake/mock for testing)

Authorization API for CASA (Continuous Agent Semantic Authorization) Cognition Engine.

**Features:**
- POST /authorize endpoint for authorization decisions
- CFN registration on startup (idempotent)
- Periodic heartbeats to maintain "online" status
- Graceful degradation if CFN unavailable

See [engines/casa/README.md](engines/casa/README.md) for details.

## Adding a New Engine

### 1. Create Directory Structure

```bash
mkdir -p engines/my-engine/src
cd engines/my-engine
```

### 2. Add Python Code

**`src/service.py`** - FastAPI application with CFN registration:

```python
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan: register CE with CFN on startup."""
    logger.info("Starting My Engine")

    # Optional: Register with CFN (idempotent)
    # from registration import register_my_ce, shutdown_lifecycle_client
    # await register_my_ce()

    yield

    # Optional: Shutdown CFN client
    # await shutdown_lifecycle_client()
    logger.info("Shutting down My Engine")


app = FastAPI(
    title="My Engine API",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.post("/process")
async def process(data: dict):
    # Your logic here
    return {"result": "processed"}


if __name__ == "__main__":
    import uvicorn
    logging.basicConfig(level=logging.INFO)
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

**Optional: `src/registration.py`** - CFN registration (see `engines/casa/src/registration.py` for reference)

**`src/models.py`** - Pydantic models (optional):

```python
from pydantic import BaseModel

class Request(BaseModel):
    data: str

class Response(BaseModel):
    result: str
```

### 3. Add Dependencies

**`requirements.txt`**:

```txt
fastapi>=0.104.0
uvicorn[standard]>=0.24.0
pydantic>=2.5.0
```

### 4. Add Dockerfile

**`Dockerfile`**:

```dockerfile
FROM python:3.11-slim

RUN useradd -u 1001 app
RUN mkdir /home/app/ && chown -R app:app /home/app

WORKDIR /home/app
USER app

COPY --chown=app:app requirements.txt .
RUN pip3 install --user -r requirements.txt

COPY --chown=app:app src/ .

EXPOSE 8000

CMD ["python3", "-m", "uvicorn", "service:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 5. Add to docker-compose.yml

Add your service to the root `docker-compose.yml`:

```yaml
services:
  my-engine:
    build:
      context: ./engines/my-engine
      dockerfile: Dockerfile
    container_name: my-engine
    ports:
      - "8002:8000"  # Choose next available port
    environment:
      - LOG_LEVEL=INFO
    healthcheck:
      test: ["CMD", "python3", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]
      interval: 10s
      timeout: 5s
      retries: 3
    restart: unless-stopped
```

### 6. Add Documentation

**`README.md`** - Document your engine:

```markdown
# My Engine

Description of what this engine does.

## API

- POST /process - Main endpoint
- GET /health - Health check

## Usage

[Add examples]
```

### 7. Test It

```bash
# Build and run
docker-compose up my-engine

# Test health
curl http://localhost:8002/health

# View docs
open http://localhost:8002/docs
```

## Development

### Run Locally (without Docker)

```bash
cd engines/my-engine
pip install -r requirements.txt
cd src
python service.py
```

### Project Layout

Each engine follows this pattern:

```
engines/<engine-name>/
├── src/
│   ├── service.py      # FastAPI app (required)
│   ├── models.py       # Pydantic models (optional)
│   └── ...             # Other modules
├── Dockerfile          # Container build (required)
├── requirements.txt    # Dependencies (required)
└── README.md          # Documentation (required)
```

### Guidelines

- Use **FastAPI** for consistency
- Use **Pydantic** for data validation
- Include `/health` endpoint for monitoring
- Use port **8000** inside container (map to different external port)
- Run as **non-root user** (use `app` user)
- Add **comprehensive documentation**

### Port Assignments

Assign external ports sequentially:

- 8001 - casa-enforcement
- 8002 - your-next-engine
- 8003 - another-engine
- ...

## API Documentation

When services are running, each provides interactive docs at `/docs`:

- http://localhost:8001/docs (CASA)
- http://localhost:8002/docs (your engine)

## Testing

Each engine should include:
- Unit tests for business logic
- Integration tests for API endpoints
- Health check validation

Example test structure:

```
engines/my-engine/
├── src/
└── tests/
    ├── test_service.py
    └── test_models.py
```

## Troubleshooting

### Port Already in Use

```bash
# Find what's using the port
lsof -i :8001

# Stop all services
docker-compose down
```

### Container Won't Start

```bash
# Check logs
docker-compose logs my-engine

# Rebuild
docker-compose build my-engine
docker-compose up my-engine
```

### Import Errors

Make sure your Dockerfile copies files correctly:

```dockerfile
COPY --chown=app:app src/ .  # Copies src/* to /home/app/
```

## CI/CD & Releases

### Continuous Integration

CI uses **matrix strategy** to build all CEs in parallel. When you add a new CE, update `.github/workflows/ci.yaml`:

```yaml
strategy:
  matrix:
    ce:
      - name: casa-ce
        path: engines/casa
        dockerfile: engines/casa/Dockerfile
        pyproject: engines/casa/pyproject.toml
      - name: your-new-ce    # Add your CE here
        path: engines/your-new-ce
        dockerfile: engines/your-new-ce/Dockerfile
        pyproject: engines/your-new-ce/pyproject.toml
```

CI automatically runs on:
- **Pull Requests** → Build validation only (no push)
- **Main branch** → Build + push `:latest` + `:YYYY-MM-DD-<sha>`
- **Tags** → Build + push `:<tag-name>` (semantic version)

All CEs are tested and built in parallel.

### Release Process

To release a new version of CASA CE:

1. **Update version** in `engines/casa/pyproject.toml`:
   ```toml
   version = "0.2.0"
   ```

2. **Commit and push**:
   ```bash
   git commit -m "Bump CASA CE version to 0.2.0"
   git push origin main
   ```

3. **Create and push tag**:
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

4. **CI validates and builds**:
   - Validates tag format (`vX.Y.Z`)
   - Verifies `pyproject.toml` version matches tag
   - Builds multi-platform Docker image (amd64, arm64)
   - Pushes to `ghcr.io/cisco-eti/ioc-scale-cf-cognition-engines/casa-ce:v0.2.0`

### Docker Images

Images are published to GitHub Container Registry:

```
ghcr.io/cisco-eti/ioc-scale-cf-cognition-engines/casa-ce:latest          # Latest from main
ghcr.io/cisco-eti/ioc-scale-cf-cognition-engines/casa-ce:2026-08-12-abc1234  # Timestamped
ghcr.io/cisco-eti/ioc-scale-cf-cognition-engines/casa-ce:v0.1.0         # Version tag
```

## Contributing

1. Create your engine in `engines/<name>/`
2. Follow the structure and guidelines above
3. Add it to `docker-compose.yml`
4. Document it in your engine's `README.md`
5. Test locally
6. Submit PR

## Legacy Files

The `app/` directory contains an older demo application. It's kept for reference and can be ignored when working on cognition engines.

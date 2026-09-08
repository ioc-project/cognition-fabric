# `ioc-scale-db` image

Source for `ghcr.io/cisco-eti/ioc-scale-db`, the database used by the
`ioc-scale-db` service in `docker-compose.yml`.

It is a multi-stage build on `postgres:16-bookworm` that compiles
[AgensGraph](https://github.com/skaiworldwide-oss/agensgraph) — a PostgreSQL 16
fork with native Cypher graph queries — from source, along with two extensions:

| Component   | Version | Purpose                          |
|-------------|---------|----------------------------------|
| AgensGraph  | 2.16.0  | Cypher graph queries             |
| pgvector    | 0.8.1   | Vector similarity search         |
| TimescaleDB | 2.17.2  | Time-series hypertables          |

Building from source rather than using a prebuilt AgensGraph image is what lets
the same Dockerfile produce `linux/amd64` and `linux/arm64` images.

TimescaleDB is built under the Community license (no `-DAPACHE_ONLY=1`), which
enables compression, retention policies, and continuous aggregates. Its
`shared_preload_libraries` entry is baked into the image `CMD`, so no extra
flags are needed at runtime.

## Publishing

Run the **Manual Publish DB Image** workflow
(`.github/workflows/publish-db-manual-image.yaml`) from the Actions tab and give
it a tag. It builds each architecture on a native runner, pushes both by digest,
then joins them into a single multi-arch manifest. The workflow only appears in
the Actions tab once it is on the default branch. After it finishes, bump the
tag on the `ioc-scale-db` service in `docker-compose.yml` to match.

Verify the result carries both architectures:

```bash
docker buildx imagetools inspect ghcr.io/cisco-eti/ioc-scale-db:<tag>
```

## Building locally

From the repository root:

```bash
docker build -t ioc-scale-db docker-db
```

Expect 15-20 minutes; most of it is compiling AgensGraph and TimescaleDB.

## Verifying

```bash
docker exec -it ioc-scale-db psql -U "$IOC_KNOWLEDGE_DB_USER" -d ioc-knowledge-db
```

```sql
SELECT extname, extversion FROM pg_extension;
SHOW shared_preload_libraries;
SHOW timescaledb.license;  -- must be 'timescale', not 'apache'
```

A license of `apache` means the build picked up a stale cached layer; rebuild
with `docker build --no-cache`.

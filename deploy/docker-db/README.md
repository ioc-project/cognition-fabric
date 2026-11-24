# `ioc-scale-db` image

Source for `ghcr.io/ioc-project/ioc-scale-db`, the shared database image for
the `ioc-scale-db` service in `deploy/docker-compose.yml`.

The stack selects its image through `CF_REGISTRY` and `IOC_SCALE_DB_TAG`.
Its current registry default is still `ghcr.io/cisco-eti`; publishing to the new
organization does not switch that default. `CF_REGISTRY` also selects other CF
and Proxy images, so its migration must be coordinated with those packages.

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
([`.github/workflows/publish-db-manual-image.yaml`](../../.github/workflows/publish-db-manual-image.yaml))
from the repository's Actions tab, selecting `main` and an image tag. With an
authenticated GitHub CLI, the equivalent command is:

```bash
gh workflow run publish-db-manual-image.yaml \
  --repo ioc-project/cognition-fabric \
  --ref main \
  -f image-tag=0.2.0
```

The workflow derives its destination from `github.repository_owner`; in this
repository it publishes `ghcr.io/ioc-project/ioc-scale-db`. It builds each
architecture on a native runner, pushes both by digest, then joins them into one
manifest under the requested tag. DB publishing is separate from the five CF
application images and their component release tags.

Check for an existing tag before publishing and avoid overwriting a release.
Wait for both architecture jobs and the manifest job to succeed. Record the run
URL, source commit, index digest and platform digests. When adopting a new DB
version in the stack, align `IOC_SCALE_DB_TAG` in `.env.example` and its Compose
fallback; the current default is `0.2.0`.

### Registry access and public release

While the package is private, use an existing Docker login with permission to
read it. The workflow authenticates its own pushes with `GITHUB_TOKEN`; a public
source repository does not automatically give anonymous access to its packages.

Repository and GHCR package visibility are separate settings. Their owners
change them manually as part of the public release; this publishing workflow
does not change either setting. Verify the image with authenticated access before
release. Anonymous download checks follow confirmation that the package is public.

Verify the result carries both architectures:

```bash
docker buildx imagetools inspect ghcr.io/ioc-project/ioc-scale-db:0.2.0
docker pull --platform linux/amd64 ghcr.io/ioc-project/ioc-scale-db:0.2.0
docker pull --platform linux/arm64 ghcr.io/ioc-project/ioc-scale-db:0.2.0
```

Use the recorded platform digests for runtime verification. Label emulated runs
explicitly; a manifest listing alone does not verify that the database starts.

## Building locally

From the repository root:

```bash
docker build -t ioc-scale-db deploy/docker-db
```

Expect 15-20 minutes; most of it is compiling AgensGraph and TimescaleDB.

## Verifying

Use a disposable container with a fresh data directory, test credentials and no
host-published ports. Keep the running stack and its volumes separate. For example:

```bash
db_check_container="ioc-scale-db-check-$(date +%s)"
docker run --detach --name "$db_check_container" \
  --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_USER=dbcheck \
  -e POSTGRES_PASSWORD=dbcheck-local \
  -e POSTGRES_DB=dbcheck \
  ghcr.io/ioc-project/ioc-scale-db:0.2.0
```

Wait for database initialization, then connect using:

```bash
docker exec -it "$db_check_container" psql -v ON_ERROR_STOP=1 -U dbcheck -d dbcheck
```

```sql
SELECT version();
SELECT agversion();  -- 2.16 for the v2.16.0 source tag
SELECT extname, extversion FROM pg_extension;
SHOW shared_preload_libraries;
SHOW timescaledb.license;  -- must be 'timescale', not 'apache'
```

Verify SQL write/read, a vector-distance query, graph creation/query and a
TimescaleDB hypertable write/read on each architecture. The initial database
should contain `vector` 0.8.1 and `timescaledb` 2.17.2. The stack's separate
`init-multi-db.sh` and `ensure-databases.sh` create its application databases;
check those scripts against disposable storage when validating stack bootstrap.

After exiting `psql`, remove only the test container:

```bash
docker rm --force "$db_check_container"
```

If an extension or feature check fails, inspect the build and initialization
logs before adopting the image. Do not use an existing application database for
these write checks.

# Component releases

Components are versioned independently. The table lists the version metadata in
this repository and the corresponding Git tags.

| Component | Version | Git tag |
| --- | --- | --- |
| CFN | 1.0.0 | `cfn/v1.0.0` |
| Management | 1.0.0 | `cf-mgmt/v1.0.0` |
| UI | 1.0.0 | `cf-ui/v1.0.0` |
| Go Demo CE | 1.0.0 | `samples/demo-ce/v1.0.0` |
| Python Template CE | 1.0.0 | `samples/template-ce/v1.0.0` |
| API module | 1.0.0 | `api/v1.0.0` |

NOA and the documentation site are bundled samples without independent release
streams. Update this table when publishing a component version.

## Version metadata

- CFN, Go Demo CE and API versions are stored in their `VERSION` files.
- Management and Template CE versions are in `pyproject.toml`.
- The UI version is in `package.json` and must match both version entries in
  `package-lock.json`.

Use semantic versions. A component release changes that component's version;
unrelated component versions remain unchanged. Publish an API tag only once the CE
contract is approved stable. An incompatible v2 Go API module requires a `/v2`
import path.

## Release workflow

The [component release workflow](../.github/workflows/release.yaml) runs for
component-prefixed tags. It validates the prefix and semantic version against
the component metadata, runs all [CI test suites](../.github/workflows/ci.yaml)
with the five-image validation matrix disabled, and builds and publishes only the
selected component's image to GHCR. For example, `cfn/v1.0.0`
publishes image tag `v1.0.0`; the folder prefix belongs only to the Git tag.
The API is released by its Go module tag and has no container image.
Its module path is `github.com/ioc-project/cognition-fabric/api`. The `1.0.0`
version metadata does not itself publish `api/v1.0.0`; that tag must point to a
commit with the matching module declaration before external consumers can fetch
that version. Local CFN and Demo CE builds use relative API replacements.

The release workflow uses `GITHUB_TOKEN` to publish images. The target GHCR
package must allow the repository's Actions access. UI image builds use the
repository variable `CFN_UI_API_BASE_URL`, defaulting to `http://localhost:9000`.
Main-branch CI publishes its configured image aliases separately from component
tags. Both workflows target these packages under `ghcr.io/ioc-project`:

| Component | Image |
| --- | --- |
| CFN | `ghcr.io/ioc-project/ioc-scale-cfn-svc` |
| Management | `ghcr.io/ioc-project/ioc-scale-cf-mgmt-svc` |
| UI | `ghcr.io/ioc-project/ioc-scale-cf-ui` |
| Go Demo CE | `ghcr.io/ioc-project/ioc-scale-cf-demo-ce/demo-ce` |
| Python Template CE | `ghcr.io/ioc-project/ioc-scale-cf-demo-ce/template-ce` |

A successful push to `main` publishes `latest` and a dated commit tag for each
image, plus `main` for Management and UI. Component releases publish only the
selected image's `vX.Y.Z` tag. Main pushes, component releases and manual CI
dispatches build `linux/amd64` and `linux/arm64`. Pull requests build without
publishing; manual CI dispatches publish `ci-<first-seven-commit-characters>`
tags as described below.
Package visibility is set manually in GitHub; these workflows do not change it.

## Publish branch images manually

The selected branch must include the CI workflow changes that enable manual
publishing. To publish from a pushed branch before merging, select it under
**Actions → CI → Run workflow**, or dispatch CI from the command line:

```bash
gh workflow run ci.yaml --repo ioc-project/cognition-fabric \
  --ref your-branch
```

This runs all test suites, then builds and publishes all five images for
`linux/amd64` and `linux/arm64` using the selected commit's `ci-<sha>` tag.
Manual runs use that tag even when selecting `main`; only main-push runs update
`latest`, dated commit tags and the Management/UI `main` aliases.

Use the published tag with the existing local image tasks, for example:

```bash
CF_REGISTRY=ghcr.io/ioc-project CFN_SVC_TAG=ci-0123456 task run:cfn:image
```

Replace `ci-0123456` with the tag from the run. See the
[local image workflow](../dev/README.md#published-cf-images-with-the-local-databases)
for the other service tag selectors. CF/DB images default to
`CF_REGISTRY=ghcr.io/ioc-project`; an existing `.env` that selects the old registry
must be updated explicitly, or overridden for the command. Proxy images use
`PROXY_REGISTRY` independently. Command-specific overrides leave `.env`
unchanged. An AMD64-only PR build does not validate ARM64; record the ARM64 UI
`npm ci` and Next.js build durations from the manual run's Buildx logs, plus
the total image-job duration.

## Documentation deployment

The [Pages workflow](../.github/workflows/pages.yaml) publishes the
[Cognition Fabric documentation site](https://ioc-project.github.io/cognition-fabric/).
The source is in [`docs/site/`](site/index.md). The architecture diagram is
shared with [the repository architecture document](architecture.md).

Use Python 3.11 or newer to build and preview the site from the repository root.

```sh
python3 -m venv .local/pages-venv
. .local/pages-venv/bin/activate
python -m pip install -r docs/requirements.txt
python -m mkdocs build --strict
python -m mkdocs serve --strict
```

Open `http://127.0.0.1:8000/cognition-fabric/`. The static build is in
`.local/pages/`. PR CI runs the strict build for review. GitHub Pages uses
**GitHub Actions** as its source and the `github-pages` deployment environment.
The workflow runs on site changes pushed to `main` or when dispatched on
`main`.

Before publishing the quickstart, verify its images and pinned Proxy runtime
can be retrieved from a clean environment and follow the guide end to end.

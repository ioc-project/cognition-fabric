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

The release workflow uses `GITHUB_TOKEN` to publish images. The target GHCR
package must allow the repository's Actions access. UI image builds use the
repository variable `CFN_UI_API_BASE_URL`, defaulting to `http://localhost:9000`.
Main-branch CI publishes its configured image aliases separately from component
tags.

## Validate an ARM64 UI build

To validate a published PR branch before merging, manually dispatch CI with the
`ui-arm64` input:

```bash
gh workflow run ci.yaml --repo cisco-eti/cognition-fabric \
  --ref <published-pr-branch> -F ui-arm64=true
```

This runs all test suites and the five validation image builds. The UI targets
both `linux/amd64` and `linux/arm64`; the other images target `linux/amd64`.
Manual dispatch does not publish images, including when the selected branch is
`main`. Record the ARM64 `npm ci` and Next.js build durations from the Buildx
logs, plus the total image-job duration.

## Documentation deployment

The [Pages workflow](../.github/workflows/pages.yaml) publishes one site containing
the CE documentation and the Management API viewer/schema under `/mgmt-api/`.
Configure the Pages source and deployment environment as described in the
[site maintenance guide](../samples/docs-site/content/contributing.md#github-pages).

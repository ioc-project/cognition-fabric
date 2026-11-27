# CI image build boundaries

**Scope:** Image validation, component releases and UI ARM64 verification.

**Guidance:** Preserve component-specific build tooling. Explicit QEMU setup is
enabled only for Management in CI and component releases. Pin remote actions to
full commit SHAs with verified version comments; changing action majors is a
separate decision.

The final CI job uses `ci-summary` as both its ID and display name to match
the organization's required check. The reusable CI workflow defaults
`include-images` to true. Only boolean false disables its image matrix.
`ci-summary` accepts an image-job skip only in that case, and every test suite
must still succeed. Ordinary PR and main-push runs keep their image builds
enabled when reusable-workflow inputs are absent.

An AMD64 PR build does not validate the ARM64 image path. Manual CI dispatches
run the suites and publish all five images for AMD64 and ARM64 as `ci-<sha>`.
They use commit tags even when selecting `main`; stable aliases belong only to
main-push runs. Automatic PR runs remain build-only. Record the manual run's
ARM64 UI install, application-build and total job durations before claiming
ARM64 verification. The former build-only `ui-arm64` input is removed.

**Why:** Shared workflow defaults can change a component's working build setup.
GitHub's loose equality also equates a missing input with boolean false unless
the condition distinguishes their types.

**Evidence:** [CI](../../.github/workflows/ci.yaml),
[component releases](../../.github/workflows/release.yaml),
[status regressions](../../.github/tests/test_ci_workflows.py), and
[manual publishing procedure](../releases.md#publish-branch-images-manually).

**Revisit when:** Supported architectures, emulation, workflow inputs or release
validation requirements change.

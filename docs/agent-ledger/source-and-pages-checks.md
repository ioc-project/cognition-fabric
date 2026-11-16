# Source and Pages checks

**Scope:** Source-file coverage and documentation publication.

**Guidance:** Verify that files needed by builds are tracked, rather than relying
on files present only in a working directory. Anchor CFN's binary ignore rule as
`/cfn` in `cfn/.gitignore`; an unanchored `cfn` pattern also hides
`cmd/cfn/main.go`. Check builds from a clean source checkout.

Normalize the Pages URL path to a trailing slash before deriving Docusaurus
`baseUrl` and the relative Management viewer URL. `actions/configure-pages`
returns a `base_url` without the trailing slash. Test root and project paths with
both URL forms. Site links to source directories outside the docs tree must use
GitHub source URLs, since filesystem directories are not website routes.

**Why:** An on-disk build can mask ignored entrypoint files. An unnormalized
project URL can send `mgmt-api/` links to the organization root. A Markdown target
that exists on disk can still be absent from Docusaurus output.

**Evidence:** [CFN ignore rules](../../cfn/.gitignore),
[Pages configuration](../../samples/docs-site/docusaurus.config.js), and
[automation regressions](../../.github/tests/).

**Revisit when:** Repository layout, ignore rules or Pages hosting changes.

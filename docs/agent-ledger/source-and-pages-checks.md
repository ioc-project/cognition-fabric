# Source and Pages checks

**Scope:** Source-file coverage and documentation publication.

**Guidance:** Verify that files needed by builds are tracked, rather than relying
on files present only in a working directory. Anchor CFN's binary ignore rule as
`/cfn` in `cfn/.gitignore`; an unanchored `cfn` pattern also hides
`cmd/cfn/main.go`. Check builds from a clean source checkout.

Keep MkDocs' canonical `site_url` at the project path with its trailing slash.
Preview under `/cognition-fabric/` to check navigation and assets. Only
`docs/site/` and explicitly included assets are website inputs. Use GitHub
source links for files outside the published tree. Keep the architecture SVG
in `docs/assets/` and include it at build time through the MkDocs hook.

**Why:** An on-disk build can mask ignored entrypoint files. Serving at the
project path catches links that would otherwise resolve from the organization
root. The narrow site tree keeps repository reference material out of the
Pages artifact.

**Evidence:** [CFN ignore rules](../../cfn/.gitignore),
[MkDocs configuration](../../mkdocs.yml), and
[Pages build and preview](../releases.md#documentation-deployment).

**Revisit when:** Repository layout, ignore rules or Pages hosting changes.

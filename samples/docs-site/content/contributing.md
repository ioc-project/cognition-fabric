---
title: Maintain the documentation
---

# Maintain the documentation

The documentation uses Docusaurus with the classic documentation theme and the official Mermaid theme.
All site files live in `docs/`; the pages are in `docs/content/`.

## Preview

Use Node.js 22 or newer, then from the repository root:

```bash
cd docs
npm ci
npm start
```

The default local address is `http://localhost:3000/`.
Docusaurus provides sidebar navigation, light/dark themes, local full-text search and code copy controls.

## Build and serve the static output

```bash
npm run build
npm run serve
```

The build fails on broken internal page or anchor links. Generated output in `docs/build/`, the Docusaurus
cache and `node_modules/` are ignored by Git. Commit `package-lock.json` with dependency changes.

## GitHub Pages

The workflow `.github/workflows/docs.yaml` builds documentation on relevant pull requests and pushes
to `main`, and supports manual runs. Deployment runs only from `main` through the `github-pages`
environment using the Pages artifact actions. No branch publishing or GitHub token needs to be stored
in the site configuration.

Before the first deployment, a repository maintainer must select **GitHub Actions** in
**Settings → Pages → Build and deployment → Source**. An organization may require approval on the
`github-pages` environment. Follow its existing rules.

The configured private site is `https://refactored-carnival-2m9k3yw.pages.github.io/`.
Access follows the repository's GitHub Pages permissions. The workflow reads the Pages URL from
`actions/configure-pages` and supplies `PAGES_URL` to the build, so links and assets use the correct
host and base path. For local builds, `docusaurus.config.js` defaults to that same site URL.
Override `PAGES_URL` when testing another deployment address.

## Keep the narrative accurate

Update the relevant page and component README with a behavior change. In particular:

- Keep the Mermaid flow aligned with actual Store and OXP calls.
- Distinguish the Python stub from the Go evaluator.
- Use `config` for the demo's configuration terminology.
- Describe what a log event proves, including the difference between lookup and evidence validation.
- Keep scope limited to Demo CE and Template CE. Link out for the platform and application setup.

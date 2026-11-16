# Cognition Engine documentation

Docusaurus documentation for `demo-ce` and `template-ce`, with Mermaid diagrams and a GitHub Pages workflow.

Site: [Cognition Engine documentation](https://refactored-carnival-2m9k3yw.pages.github.io/) (private GitHub Pages).

## Local preview

Requires Node.js 22 or newer. From the repository root:

```bash
cd docs
npm ci
npm start
```

Open `http://localhost:3000/`.

## Build

```bash
npm run build
npm run serve
```

Pages live in `content/`; navigation is defined in `sidebars.js`.
The project Pages path is configured in `docusaurus.config.js`.
See [maintaining the site](content/contributing.md) for deployment setup and editing guidance.

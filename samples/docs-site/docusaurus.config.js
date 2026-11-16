// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

const repository = 'https://github.com/cisco-eti/cognition-fabric';
const pagesUrl = new URL(process.env.PAGES_URL || 'https://cisco-eti.github.io/cognition-fabric/');
// configure-pages may return a project URL without the final slash. Treat it
// as a directory before deriving either Docusaurus's base or the viewer URL.
pagesUrl.pathname = `${pagesUrl.pathname.replace(/\/+$/, '')}/`;

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Cognition Engines',
  tagline: 'Demo CE and Template CE',
  favicon: 'img/ce.svg',
  url: pagesUrl.origin,
  baseUrl: pagesUrl.pathname,
  organizationName: 'cisco-eti',
  projectName: 'cognition-fabric',
  trailingSlash: true,
  onBrokenLinks: 'throw',
  markdown: { mermaid: true, hooks: { onBrokenMarkdownLinks: 'throw' } },
  themes: [
    '@docusaurus/theme-mermaid',
    ['@easyops-cn/docusaurus-search-local', {
      hashed: 'filename',
      docsDir: 'content',
      docsRouteBasePath: '/',
      indexBlog: false,
      indexPages: false,
      highlightSearchTermsOnTargetPage: true,
    }],
  ],
  i18n: { defaultLocale: 'en', locales: ['en'] },
  presets: [['classic', {
    docs: {
      path: 'content',
      routeBasePath: '/',
      sidebarPath: './sidebars.js',
      editUrl: `${repository}/edit/main/samples/docs-site/`,
      showLastUpdateAuthor: false,
      showLastUpdateTime: false,
    },
    blog: false,
    theme: { customCss: './src/css/custom.css' },
    sitemap: { changefreq: 'weekly', priority: 0.5 },
  }]],
  themeConfig: {
    colorMode: { defaultMode: 'light', respectPrefersColorScheme: true },
    navbar: {
      title: 'Cognition Engines',
      logo: { alt: 'CE documentation', src: 'img/ce.svg' },
      items: [
        { to: '/demo-ce/overview', label: 'Demo CE', position: 'left' },
        { to: '/template-ce/overview', label: 'Template CE', position: 'left' },
        { href: new URL('mgmt-api/', pagesUrl).href, label: 'Management API', position: 'right' },
        { href: repository, label: 'GitHub', position: 'right' },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        { title: 'Demo CE', items: [
          { label: 'Run locally', to: '/demo-ce/quickstart' },
          { label: 'Evaluation flow', to: '/demo-ce/evaluation-flow' },
          { label: 'Recording walkthrough', to: '/demo-ce/walkthrough' },
        ] },
        { title: 'Template CE', items: [
          { label: 'Get started', to: '/template-ce/quickstart' },
          { label: 'Extend the template', to: '/template-ce/development' },
        ] },
        { title: 'Project', items: [
          { label: 'Source code', href: repository },
          { label: 'Maintain these docs', to: '/contributing' },
        ] },
      ],
      copyright: 'IOC · Cognition Engine documentation',
    },
    prism: { additionalLanguages: ['go', 'protobuf', 'bash', 'json'] },
    mermaid: {
      theme: { light: 'neutral', dark: 'dark' },
      options: { sequence: { wrap: true, width: 160, actorMargin: 50, messageMargin: 40 } },
    },
  },
};
export default config;

// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

export default {
  documentation: [
    'index',
    { type: 'category', label: 'Demo CE', collapsed: false, items: [
      'demo-ce/overview', 'demo-ce/quickstart', 'demo-ce/evaluation-flow',
      'demo-ce/configuration', 'demo-ce/logs', 'demo-ce/walkthrough', 'demo-ce/troubleshooting',
    ] },
    { type: 'category', label: 'Template CE', collapsed: false, items: [
      'template-ce/overview', 'template-ce/quickstart', 'template-ce/configuration', 'template-ce/development',
    ] },
    'contributing',
  ],
};

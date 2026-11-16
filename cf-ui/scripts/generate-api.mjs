#!/usr/bin/env node
// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import {readFile, writeFile} from 'node:fs/promises';
import openapiTS, {astToString, COMMENT_HEADER} from 'openapi-typescript';

const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--check')) {
  throw new Error('Usage: node scripts/generate-api.mjs [--check]');
}
const schema = new URL('../../api/mgmt/openapi/openapi.json', import.meta.url);
const output = new URL('../src/api/generated/schema.d.ts', import.meta.url);
const header = '// Copyright 2026 Cisco Systems, Inc. and its affiliates\n//\n// SPDX-License-Identifier: Apache-2.0\n\n';
const rendered = header + COMMENT_HEADER + astToString(await openapiTS(schema));
if (args.includes('--check')) {
  const current = await readFile(output, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') {
      return '';
    }
    throw error;
  });
  if (current !== rendered) {
    console.error('Management API types are stale; run npm run generate:api in cf-ui.');
    process.exitCode = 1;
  } else {
    console.log('Management API types are current');
  }
} else {
  await writeFile(output, rendered, 'utf8');
  console.log('Generated Management API types from api/mgmt/openapi/openapi.json');
}

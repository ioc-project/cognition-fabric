// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const url = new URL('../src/lib/utils.ts', import.meta.url);
const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}
}).outputText;
const module = {exports: {}};
new Function('require', 'module', 'exports', compiled)(createRequire(url), module, module.exports);
const {parseTimestamp, formatTimestamp, formatRelativeTimestamp, compareTimestamps, formatAuditTimestamp, sortByCreatedAtDesc, safeGetDate} =
  module.exports;

const utc = '2026-11-11T23:45:12.123Z';
const offset = '2026-11-12T05:15:12.123456789+05:30';

test('explicit-zone API stamps preserve the instant, including offsets and fractions', () => {
  assert.equal(parseTimestamp(offset).toISOString(), utc);
  assert.equal(parseTimestamp('2026-11-11T18:45:12.123-05:00').toISOString(), utc);
  assert.equal(parseTimestamp('2026-11-11t23:45:12.123z').toISOString(), utc);
  assert.equal(parseTimestamp('2024-02-29T00:00:00Z').toISOString(), '2024-02-29T00:00:00.000Z');
  assert.equal(compareTimestamps(utc, offset), 0);
});

test('missing, malformed, impossible and zone-less API stamps use existing placeholders', () => {
  for (const value of [
    undefined,
    null,
    '',
    'now',
    '2026-11-11',
    '2026-11-11T23:45:12',
    '2026-02-29T12:00:00Z',
    '2026-11-31T00:00:00Z',
    '2026-11-11T24:00:00Z',
    '2026-11-11T23:45:12+24:00',
    '2026-11-11T23:45:12+01:60'
  ]) {
    assert.equal(parseTimestamp(value), null, String(value));
    assert.equal(formatTimestamp(value), 'Unknown');
    assert.equal(formatTimestamp(value, undefined, '-'), '-');
    assert.equal(formatRelativeTimestamp(value), 'Never');
    assert.equal(formatAuditTimestamp(value), 'N/A');
  }
  // The generic helper still supports non-API Date/number inputs.
  assert.equal(safeGetDate(new Date(utc)).toISOString(), utc);
  assert.equal(safeGetDate(Date.parse(utc)).toISOString(), utc);
});

test('absolute display defaults to labelled UTC and supports an explicit display timezone', () => {
  assert.equal(formatTimestamp(offset), formatTimestamp(utc));
  assert.match(formatTimestamp(utc), /Nov 11, 2026.*23:45.*UTC/);
  assert.match(formatTimestamp(utc, undefined, 'Unknown', 'Asia/Kolkata'), /Nov 12, 2026.*05:15.*GMT\+5:30/);
});

test('relative times and comparisons use the timestamp instant', () => {
  const now = Date.parse(utc) + 25 * 60 * 1000;
  assert.equal(formatRelativeTimestamp(utc, now), '25m ago');
  assert.equal(formatRelativeTimestamp(offset, now), '25m ago');
  assert.equal(formatRelativeTimestamp(utc, now + 2 * 3600000), '2h ago');
  assert.equal(formatRelativeTimestamp(utc, now + 2 * 86400000), '2d ago');
  assert.ok(compareTimestamps(utc, '2026-11-11T23:44:12Z') > 0);
});

test('descending lists preserve input and put absent or invalid dates last', () => {
  const items = [
    {id: 'missing'},
    {id: 'older', created_at: '2026-11-11T23:44:12Z'},
    {id: 'naive', created_at: '2026-11-11T23:46:12'},
    {id: 'latest', created_at: offset},
    {id: 'null', created_at: null}
  ];
  assert.deepEqual(
    sortByCreatedAtDesc(items).map(({id}) => id),
    ['latest', 'older', 'missing', 'naive', 'null']
  );
  assert.equal(items[0].id, 'missing');
  assert.equal(compareTimestamps(null, undefined), 0);
  assert.ok(compareTimestamps(null, utc) < 0);
});

test('audit flat and grouped formats retain seconds and their exact year widths', () => {
  assert.equal(formatAuditTimestamp(offset, true), '11/11/26 23:45:12');
  assert.equal(formatAuditTimestamp(offset), '11/11/2026 23:45:12');
  assert.equal(formatAuditTimestamp('2026-11-12T01:00:00+02:00'), '11/11/2026 23:00:00');
});

test('UTC and non-UTC process settings produce the same API presentation and sorting', () => {
  const script = `
    const module = {exports: {}};
    new Function('require', 'module', 'exports', ${JSON.stringify(compiled)})(require, module, module.exports);
    const {parseTimestamp, formatTimestamp, formatRelativeTimestamp, formatAuditTimestamp, sortByCreatedAtDesc} = module.exports;
    console.log(JSON.stringify({
      parsed: parseTimestamp(${JSON.stringify(offset)}).toISOString(),
      display: formatTimestamp(${JSON.stringify(offset)}),
      relative: formatRelativeTimestamp(${JSON.stringify(offset)}, Date.parse(${JSON.stringify(utc)}) + 60000),
      naive: formatTimestamp('2026-11-11T23:45:12'),
      flat: formatAuditTimestamp(${JSON.stringify(offset)}, true),
      grouped: formatAuditTimestamp(${JSON.stringify(offset)}),
      sorted: sortByCreatedAtDesc([{id: 'missing'}, {id: 'old', created_at: '2026-11-11T23:44:12Z'}, {id: 'new', created_at: ${JSON.stringify(offset)}}]).map(item => item.id)
    }));`;
  const results = ['UTC', 'America/New_York', 'Asia/Kolkata'].map((timeZone) => {
    const result = spawnSync(process.execPath, ['-e', script], {env: {...process.env, TZ: timeZone}, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  });
  assert.deepEqual(results[1], results[0]);
  assert.deepEqual(results[2], results[0]);
});

// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

// Use the project's compiler so this runs on the supported Node 20 baseline.
const source = readFileSync(new URL('../src/components/mas/audit-presentation.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}
}).outputText;
const {auditEventMatchesMas, auditTypeOptions, getAuditActorName, getAuditTraceId, getAuditOutcome, getAuditOutcomeLabel, outcomeLabels} =
  await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

const cfn = {
  id: 'cfn-1',
  source: 'CFN',
  resource_type: 'COGNITION_ENGINE',
  resource_identifier: 'ce-1',
  audit_type: 'CE_INVOKED',
  audit_resource_identifier: 'mas-1',
  success: true,
  audit_information: {outcome: 'DECISION_DENY', ce_name: 'CASA', trace_id: 'trace-1'}
};
const proxy = {
  ...cfn,
  id: 'proxy-1',
  source: 'PROXY',
  resource_type: 'ENFORCEMENT_PROXY',
  resource_identifier: '',
  audit_type: 'PROXY_MEDIATED',
  audit_information: {mas_id: 'mas-1', applied_outcome: 'APPLIED_OUTCOME_BLOCKED', trace_id: 'trace-1'}
};

test('canonical outcomes use the same labels in filters and both producers', () => {
  for (const [canonical, kind] of Object.entries({
    ALLOW: 'allow',
    BLOCK: 'deny',
    MODIFY_REQUESTED: 'modify',
    ERROR: 'error',
    DEGRADED: 'degraded',
    UNSUPPORTED: 'unsupported',
    UNKNOWN: 'unknown'
  })) {
    assert.equal(getAuditOutcome({...proxy, outcome: canonical}), kind);
    assert.equal(getAuditOutcome({...cfn, outcome: canonical}), kind);
    assert.equal(getAuditOutcomeLabel({...proxy, outcome: canonical}), outcomeLabels[canonical]);
    assert.equal(getAuditOutcomeLabel({...cfn, outcome: canonical}), outcomeLabels[canonical]);
  }
  assert.equal(getAuditOutcome({...cfn, outcome: 'ALLOW'}), 'allow'); // Overrides original DENY.
  assert.equal(getAuditOutcomeLabel({...cfn, outcome: 'BLOCK'}), 'Block');
  assert.equal(getAuditOutcomeLabel({...proxy, outcome: 'BLOCK'}), 'Block');
  assert.equal(getAuditOutcomeLabel({...cfn, outcome: 'MODIFY_REQUESTED'}), 'Modify requested');
  assert.equal(getAuditOutcomeLabel({...proxy, outcome: 'MODIFY_REQUESTED'}), 'Modify requested');
});

test('older rows and older Management responses use source evidence', () => {
  assert.equal(getAuditOutcome(cfn), 'deny');
  assert.equal(getAuditOutcomeLabel(cfn), 'Block');
  assert.equal(getAuditOutcomeLabel({...cfn, audit_information: {outcome: 'DECISION_MODIFY'}}), 'Modify requested');
  assert.equal(getAuditOutcome({...cfn, success: false}), 'error');
  assert.equal(getAuditOutcome(proxy), 'deny');
  assert.equal(getAuditOutcome({...proxy, audit_information: {applied_outcome: 'APPLIED_OUTCOME_DEGRADED'}}), 'degraded');
  assert.equal(getAuditOutcome({...proxy, audit_information: {applied_outcome: 'APPLIED_OUTCOME_UNSPECIFIED'}}), 'unknown');
  assert.equal(getAuditOutcome({...proxy, outcome: 'UNKNOWN'}), 'unknown');
  assert.equal(getAuditOutcome({...proxy, outcome: 'ALLOW', success: false}), 'allow'); // Status is separate.
  assert.equal(getAuditOutcome({...proxy, outcome: 'FUTURE_OUTCOME'}), 'unknown');
});

test('Proxy MAS matching includes long IDs and excludes unassociated records', () => {
  assert.equal(auditEventMatchesMas(proxy, 'mas-1', new Set(), null), true);
  assert.equal(auditEventMatchesMas(proxy, 'mas-other', new Set(), null), false);
  const longId = 'm'.repeat(129);
  assert.equal(auditEventMatchesMas({...proxy, audit_resource_identifier: '', audit_information: {mas_id: longId}}, longId, new Set(), null), true);
  assert.equal(auditEventMatchesMas({...proxy, audit_resource_identifier: '', audit_information: {}}, 'mas-1', new Set(), null), false);
});

test('Actor and trace identity work for combined logs', () => {
  assert.equal(getAuditActorName(cfn), 'CASA');
  assert.equal(getAuditActorName({...cfn, audit_information: {ce_name: '  '}}), undefined);
  assert.equal(getAuditActorName(proxy), 'proxy');
  assert.equal(getAuditTraceId(cfn), getAuditTraceId(proxy));
  for (const info of [{trace_id: ''}, {trace_id: '   '}, {trace_id: 'trace-1', truncated_fields: ['trace_id']}, {}]) {
    assert.equal(getAuditTraceId({...proxy, audit_information: info}), null);
  }
  assert.ok(auditTypeOptions.some(({value}) => value === 'PROXY_MEDIATED'));
});

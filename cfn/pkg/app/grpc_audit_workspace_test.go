// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/cisco-eti/cognition-fabric/cfn/pkg/audit"
	"github.com/cisco-eti/cognition-fabric/cfn/pkg/client/database"
	"gorm.io/datatypes"
)

// Opt in with CF_AUDIT_WORKSPACE_VERIFY=1 when the monorepo's Management virtualenv
// and UI dependencies are available. The upstream CFN HTTP call is real; no
// Management request mocks or production services/databases are used.
func verifyAuditWorkspaceReaders(t *testing.T, store database.Store) {
	t.Helper()
	success := true
	if err := store.CreateAuditEvent(context.Background(), &audit.Audit{
		Source: audit.SourceCFN, ResourceType: audit.ResourceTypeCognitionEngine,
		ResourceIdentifier: "ce-fixture", AuditType: audit.AuditTypeCEInvoked,
		AuditResourceIdentifier: "fa7c634b-38a1-4ad0-aeb6-ffda79c7b6cb", Success: &success,
		AuditInformation: datatypes.JSON(`{"outcome":"DECISION_ALLOW","ce_name":"CASA","mas_id":"fa7c634b-38a1-4ad0-aeb6-ffda79c7b6cb","trace_id":"579d6c3efa084969378c34a67b060a26","source_agent_id":"planner","destination_agent_id":"schedule_agent"}`),
	}); err != nil {
		t.Fatal(err)
	}
	a := &App{db: store}
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { a.listAuditEventsHandler(w, r) }))
	defer upstream.Close()
	mgmt, err := filepath.Abs("../../../cf-mgmt")
	if err != nil {
		t.Fatal(err)
	}
	ui, err := filepath.Abs("../../../cf-ui")
	if err != nil {
		t.Fatal(err)
	}
	result := filepath.Join(t.TempDir(), "management-audit.json")
	python := exec.Command(filepath.Join(mgmt, ".venv/bin/python"), "-c", `
import json, os
from pathlib import Path
from fastapi.testclient import TestClient
from server.main import app
client = TestClient(app)
response = client.get("/api/audit-events/?outcome=ALLOW")
assert response.status_code == 200, response.text
data = response.json()
assert data["pageInfo"]["totalElements"] == 3, data
assert {row["source"] for row in data["data"]} == {"CFN", "PROXY"}
assert client.get("/api/audit-events/?decision=allow").json()["pageInfo"]["totalElements"] == 3
assert client.get("/api/audit-events/?audit_type=PROXY_MEDIATED&outcome=ALLOW").json()["pageInfo"]["totalElements"] == 2
# The authorization and two middleware variants have no host-applied outcome.
unknown = client.get("/api/audit-events/?outcome=UNKNOWN").json()
assert unknown["pageInfo"]["totalElements"] == 3, unknown
assert {row["outcome"] for row in unknown["data"]} == {"UNKNOWN"}, unknown
assert client.get("/api/audit-events/?decision=block&outcome=ALLOW").status_code == 400
Path(os.environ["CF_AUDIT_VERIFY_RESULT"]).write_text(json.dumps(data))
`)
	python.Dir = mgmt
	python.Env = append(os.Environ(), "PYTHONPATH=src", "CFN_SVC_URL="+upstream.URL, "CF_AUDIT_VERIFY_RESULT="+result)
	if output, err := python.CombinedOutput(); err != nil {
		t.Fatalf("Management live-upstream verification: %v\n%s", err, output)
	}
	node := exec.Command("node", "--input-type=module", "-e", `
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compiled = ts.transpileModule(readFileSync(process.argv[1], 'utf8'), {
 compilerOptions: {module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}
}).outputText;
const presentation = await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const rows = JSON.parse(readFileSync(process.argv[2], 'utf8')).data;
assert.equal(rows.length, 3);
assert.deepEqual(new Set(rows.map(presentation.getAuditActorName)), new Set(['CASA','proxy']));
assert.equal(rows.filter(row => presentation.getAuditOutcome(row) === 'allow').length, 3);
assert.equal(new Set(rows.map(presentation.getAuditTraceId)).size, 1);
for (const row of rows) {
 assert.equal(presentation.auditEventMatchesMas(row,'fa7c634b-38a1-4ad0-aeb6-ffda79c7b6cb',new Set(),null), true);
 assert.equal('source_record_id' in row, false);
 assert.equal('mas_id' in row, false);
 assert.equal(row.audit_information.source_agent_id, 'planner');
 if (row.source === 'CFN') assert.equal(row.audit_information.outcome, 'DECISION_ALLOW');
 else assert.equal(row.audit_information.applied_outcome, 'APPLIED_OUTCOME_ALLOWED');
}
`, filepath.Join(ui, "src/components/mas/audit-presentation.ts"), result)
	node.Dir = ui
	if output, err := node.CombinedOutput(); err != nil {
		t.Fatalf("UI presentation of Management records: %v\n%s", err, output)
	}
}

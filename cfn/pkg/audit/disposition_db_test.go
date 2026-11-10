// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package audit

import (
	"context"
	"encoding/json"
	"reflect"
	"testing"

	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
	"github.com/google/uuid"
	"gorm.io/datatypes"
)

func TestSpecificDetailsPostgresJSONBRoundTrip(t *testing.T) {
	db := testDB(t)
	for _, tc := range []struct {
		name    string
		values  map[string]any
		omitted bool
	}{
		{"NUL key", map[string]any{"key\x00": "value"}, true},
		{"NUL value", map[string]any{"key": "value\x00"}, true},
		{"NUL array", map[string]any{"array": []any{map[string]any{"key": "\x00"}}}, true},
		{"literal escape", map[string]any{`\u0000`: `\u0000`}, false},
		{"nested JSON", map[string]any{"items": []any{nil, true, 1.5, map[string]any{"key": "value"}}}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			info := DispositionInformation{Action: DispositionAction, TraceID: "postgres-nul-check", CEInvoked: true}
			err := info.CaptureResponse(&cev1.EvaluateResponse{Outcome: cev1.Decision_DECISION_ALLOW, Reason: "storable core reason", Details: specific(t, tc.values)})
			if (err != nil) != tc.omitted {
				t.Fatalf("unexpected validation result: %v", err)
			}
			data, err := info.Encode()
			if err != nil {
				t.Fatal(err)
			}
			event := &Audit{Source: SourceCFN, ResourceType: ResourceTypeCognitionEngine, ResourceIdentifier: "ce-specific", AuditType: AuditTypeCEInvoked, AuditResourceIdentifier: "mas-test", AuditInformation: datatypes.JSON(data), CreatedBy: uuid.New(), LastModifiedBy: uuid.New()}
			if err := CreateAuditEvent(context.Background(), db, event); err != nil {
				t.Fatalf("core JSONB insert failed: %v", err)
			}
			got, err := GetAuditEventByID(context.Background(), db, event.ID)
			if err != nil {
				t.Fatal(err)
			}
			var stored DispositionInformation
			if err := json.Unmarshal(got.AuditInformation, &stored); err != nil {
				t.Fatal(err)
			}
			if !tc.omitted {
				var captured map[string]any
				if err := json.Unmarshal(stored.CEResponse.Details, &captured); err != nil || !reflect.DeepEqual(captured, tc.values) {
					t.Fatalf("JSONB details changed: %s %v", stored.CEResponse.Details, err)
				}
			}
			if stored.Reason != "storable core reason" || stored.Outcome != "DECISION_ALLOW" || (stored.CEResponse == nil) != tc.omitted {
				t.Fatalf("JSONB readback changed: %s", got.AuditInformation)
			}
		})
	}
}

func TestAuditResponseEnvelopePostgresHistory(t *testing.T) {
	db := testDB(t)
	current := DispositionInformation{Action: DispositionAction}
	if err := current.CaptureResponse(&cev1.EvaluateResponse{
		Outcome: cev1.Decision_DECISION_ALLOW, Reason: "new response", TraceId: "new-trace",
		Details: specific(t, map[string]any{"arbitrary": "CE-owned data"}),
	}); err != nil {
		t.Fatal(err)
	}
	newData, err := current.Encode()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name string
		data []byte
		key  string
	}{
		{"historical", []byte(`{"outcome":"DECISION_ALLOW","ce_details":{"trace_id":"old-trace","checks_run":[{"check_id":"old-check","passed":true}]},"truncated_fields":["ce_details.timestamp"]}`), "ce_details"},
		{"new", newData, "ce_response"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			event := &Audit{Source: SourceCFN, ResourceType: ResourceTypeCognitionEngine, ResourceIdentifier: "ce-history", AuditType: AuditTypeCEInvoked, AuditResourceIdentifier: "mas-history", AuditInformation: datatypes.JSON(tc.data), CreatedBy: uuid.New(), LastModifiedBy: uuid.New()}
			if err := CreateAuditEvent(context.Background(), db, event); err != nil {
				t.Fatal(err)
			}
			got, err := GetAuditEventByID(context.Background(), db, event.ID)
			if err != nil {
				t.Fatal(err)
			}
			var want, actual map[string]any
			if err := json.Unmarshal(tc.data, &want); err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(got.AuditInformation, &actual); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(actual, want) || actual[tc.key] == nil {
				t.Fatalf("stored response shape changed on read: %s", got.AuditInformation)
			}
		})
	}
	page, err := ListAuditEvents(context.Background(), db, "", "", 0, 10)
	if err != nil || len(page.Data) != 2 {
		t.Fatalf("mixed historical/new records not readable: %v %v", page, err)
	}
	for _, event := range page.Data {
		var payload map[string]any
		if err := json.Unmarshal(event.AuditInformation, &payload); err != nil {
			t.Fatal(err)
		}
		if (payload["ce_details"] != nil) == (payload["ce_response"] != nil) {
			t.Fatalf("read normalized or duplicated the response key: %s", event.AuditInformation)
		}
	}
}

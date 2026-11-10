// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"context"
	"encoding/json"
	"math"
	"strings"
	"testing"
	"time"

	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
	enforcementv1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/enforcement/v1"
	"github.com/cisco-eti/ioc-scale-cfn-svc/pkg/client/database"
	"google.golang.org/protobuf/types/known/structpb"
)

func TestGetDispositionRetainsCoreAuditForInvalidDetails(t *testing.T) {
	for name, values := range map[string]map[string]any{
		"NaN": {"number": math.NaN()}, "Inf": {"number": math.Inf(1)}, "negative Inf": {"number": math.Inf(-1)},
		"NUL key": {"bad\x00key": "value"}, "NUL array": {"array": []any{"\x00"}},
		"oversized": {"text": strings.Repeat("x", 20*1024)},
	} {
		t.Run(name, func(t *testing.T) {
			details, err := structpb.NewStruct(values)
			if err != nil {
				t.Fatal(err)
			}
			mas := map[string]any{"id": "mas-123", "workspace_id": "ws-test-123", "cognition_engines": []map[string]any{{"ce_id": "ce-casa-1", "ce_type": "CASA", "enabled": true, "status": "online"}}}
			cleanup := setupTestEnvWithCASA(t, mas, &cev1.EvaluateResponse{Outcome: cev1.Decision_DECISION_DENY, Reason: "policy denied", Details: details}, nil)
			defer cleanup()
			store := database.NewMockDatabase()
			server := newEnforcementServer(store)
			response, err := server.GetDisposition(context.Background(), &enforcementv1.GetDispositionRequest{Payload: &enforcementv1.GetDispositionPayload{MasId: "mas-123", SourceAgentId: "source", DestinationAgentId: "target", TraceId: "trace", SpanId: "span"}})
			if err != nil || response.GetAction() != enforcementv1.GetDispositionResponse_ACTION_BLOCK || response.GetModify() {
				t.Fatalf("handler result changed: %v %v", response, err)
			}
			if !server.WaitTimeout(time.Second) {
				t.Fatal("audit write did not finish")
			}
			events, err := store.ListAuditEvents(context.Background(), "", "", 0, 10)
			if err != nil || len(events.Data) != 1 {
				t.Fatalf("core event lost: %v %v", events, err)
			}
			event := events.Data[0]
			var info map[string]any
			if err := json.Unmarshal(event.AuditInformation, &info); err != nil {
				t.Fatal(err)
			}
			if event.Success == nil || !*event.Success || event.ResourceIdentifier != "ce-casa-1" || info["reason"] != "policy denied" || info["returned_action"] != "ACTION_BLOCK" {
				t.Fatalf("core audit changed: %s", event.AuditInformation)
			}
			if _, ok := info["ce_response"]; ok {
				t.Fatalf("invalid new details retained: %s", event.AuditInformation)
			}
			if _, ok := info["ce_details"]; ok {
				t.Fatalf("new record emitted the historical response key: %s", event.AuditInformation)
			}
		})
	}
}

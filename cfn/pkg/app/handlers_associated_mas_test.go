// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ioc-project/cognition-fabric/cfn/pkg/tools/easyhttp"
)

func associatedMASRouter() http.Handler {
	rtr := easyhttp.NewRouter()
	rtr.Get("/api/cognition-engine/{ceId}/multi-agentic-systems", (&App{}).listAssociatedMASHandler)
	return rtr
}

func getAssociatedMAS(t *testing.T, ceID string) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/cognition-engine/"+ceID+"/multi-agentic-systems", nil)
	w := httptest.NewRecorder()
	associatedMASRouter().ServeHTTP(w, req)
	var body map[string]any
	if w.Body.Len() > 0 {
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatalf("unmarshal: %v body=%s", err, w.Body.String())
		}
	}
	return w.Code, body
}

func TestListAssociatedMAS_SnapshotUnavailable(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()
	applyParsedConfig(nil)

	code, body := getAssociatedMAS(t, "550e8400-e29b-41d4-a716-446655440000")
	if code != http.StatusServiceUnavailable {
		t.Fatalf("status=%d want 503 body=%v", code, body)
	}
	if body["error"] != "config snapshot unavailable" {
		t.Fatalf("error=%v", body["error"])
	}
}

func TestListAssociatedMAS_InvalidCEID(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()
	applyParsedConfig(&CfnConfigPayload{ConfigVersion: 1})

	code, body := getAssociatedMAS(t, "not-a-uuid")
	if code != http.StatusBadRequest {
		t.Fatalf("status=%d want 400 body=%v", code, body)
	}
	if body["error"] != "invalid ce_id format: must be a valid UUID" {
		t.Fatalf("error=%v", body["error"])
	}
}

func TestListAssociatedMAS_CENotInSnapshot(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()
	applyParsedConfig(&CfnConfigPayload{
		ConfigVersion:    1,
		CognitionEngines: []EngineCfg{{ID: "550e8400-e29b-41d4-a716-446655440001"}},
		Workspaces:       []WorkspaceCfg{{WorkspaceID: "ws-1"}},
	})

	code, body := getAssociatedMAS(t, "550e8400-e29b-41d4-a716-446655440000")
	if code != http.StatusNotFound {
		t.Fatalf("status=%d want 404 body=%v", code, body)
	}
	if body["error"] != "CE not yet in CFN config" {
		t.Fatalf("error=%v", body["error"])
	}
}

func TestListAssociatedMAS_EmptyAssociations(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()
	ceID := "550e8400-e29b-41d4-a716-446655440000"
	applyParsedConfig(&CfnConfigPayload{
		ConfigVersion:    1,
		CognitionEngines: []EngineCfg{{ID: ceID}},
		Workspaces: []WorkspaceCfg{{
			WorkspaceID: "ws-1",
			MASList:     []MASCfg{{ID: "mas-other", CognitionEngines: []MASEngineCfg{{ID: "other-ce"}}}},
		}},
	})

	code, body := getAssociatedMAS(t, ceID)
	if code != http.StatusOK {
		t.Fatalf("status=%d want 200 body=%v", code, body)
	}
	ids, ok := body["mas_ids"].([]any)
	if !ok || len(ids) != 0 {
		t.Fatalf("mas_ids=%v want empty array", body["mas_ids"])
	}
}

func TestListAssociatedMAS_SortedAcrossWorkspaces(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()
	ceID := "550e8400-e29b-41d4-a716-446655440000"
	applyParsedConfig(&CfnConfigPayload{
		ConfigVersion:    1,
		CognitionEngines: []EngineCfg{{ID: ceID}},
		Workspaces: []WorkspaceCfg{
			{WorkspaceID: "ws-b", MASList: []MASCfg{{ID: "mas-z", CognitionEngines: []MASEngineCfg{{ID: ceID}}}}},
			{WorkspaceID: "ws-a", MASList: []MASCfg{
				{ID: "mas-a", CognitionEngines: []MASEngineCfg{{ID: ceID}, {ID: "other"}}},
				{ID: "mas-a", CognitionEngines: []MASEngineCfg{{ID: ceID}}},
			}},
		},
	})

	code, body := getAssociatedMAS(t, ceID)
	if code != http.StatusOK {
		t.Fatalf("status=%d want 200 body=%v", code, body)
	}
	raw, _ := body["mas_ids"].([]any)
	got := make([]string, len(raw))
	for i, v := range raw {
		got[i], _ = v.(string)
	}
	want := []string{"mas-a", "mas-z"}
	if len(got) != 2 || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("mas_ids=%v want %v", got, want)
	}
}

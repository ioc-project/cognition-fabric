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

func TestGetMASHandler_MissingMASID(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()

	MgmtURL = "http://localhost:9000"

	a := &App{}
	handler := easyhttp.WrapHandler(a.getMASHandler)

	req := httptest.NewRequest(http.MethodGet, "/api/multi-agentic-systems/", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}

	var resp map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp["error"] != "mas_id is required" {
		t.Errorf("expected error 'mas_id is required', got '%s'", resp["error"])
	}
}

func TestGetMASHandler_SnapshotUnavailable(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()

	applyParsedConfig(nil)
	MgmtURL = "http://localhost:9000"

	a := &App{}
	rtr := easyhttp.NewRouter()
	rtr.Get("/api/multi-agentic-systems/{masId}", a.getMASHandler)

	req := httptest.NewRequest(http.MethodGet, "/api/multi-agentic-systems/test-mas-id", nil)
	w := httptest.NewRecorder()

	rtr.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected status %d, got %d", http.StatusServiceUnavailable, w.Code)
	}

	var resp map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp["error"] != "config snapshot unavailable" {
		t.Errorf("expected error 'config snapshot unavailable', got '%s'", resp["error"])
	}
}

func TestGetMASHandler_MASNotAssigned(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()

	applyParsedConfig(&CfnConfigPayload{
		ConfigVersion: 1,
		Workspaces:    []WorkspaceCfg{{WorkspaceID: "ws-1", MASList: []MASCfg{{ID: "mas-1"}}}},
	})
	MgmtURL = "http://localhost:9000"

	a := &App{}
	rtr := easyhttp.NewRouter()
	rtr.Get("/api/multi-agentic-systems/{masId}", a.getMASHandler)

	req := httptest.NewRequest(http.MethodGet, "/api/multi-agentic-systems/missing-mas", nil)
	w := httptest.NewRecorder()

	rtr.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected status %d, got %d body=%s", http.StatusNotFound, w.Code, w.Body.String())
	}

	var resp map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}
	if resp["error"] != "MAS not found: missing-mas" {
		t.Errorf("error = %q, want MAS not found: missing-mas", resp["error"])
	}
}

func TestGetMASHandler_MgmtURLNotConfigured(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()

	applyParsedConfig(&CfnConfigPayload{
		ConfigVersion: 1,
		Workspaces:    []WorkspaceCfg{{WorkspaceID: "test-workspace", MASList: []MASCfg{{ID: "test-mas-id"}}}},
	})
	MgmtURL = ""

	a := &App{}
	rtr := easyhttp.NewRouter()
	rtr.Get("/api/multi-agentic-systems/{masId}", a.getMASHandler)

	req := httptest.NewRequest(http.MethodGet, "/api/multi-agentic-systems/test-mas-id", nil)
	w := httptest.NewRecorder()

	rtr.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected status %d, got %d", http.StatusServiceUnavailable, w.Code)
	}

	var resp map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp["error"] != "management plane not configured" {
		t.Errorf("expected error 'management plane not configured', got '%s'", resp["error"])
	}
}

func TestGetMASHandler_UsesSnapshotWorkspace(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()

	var paths []string
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		if r.URL.Path == "/api/workspaces/ws-other/multi-agentic-systems/mas-abc" {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id":           "mas-abc",
				"workspace_id": "ws-other",
				"name":         "Other MAS",
			})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer mock.Close()

	MgmtURL = mock.URL
	applyParsedConfig(&CfnConfigPayload{
		ConfigVersion: 1,
		Workspaces: []WorkspaceCfg{
			{WorkspaceID: "ws-default", WorkspaceName: "Default Workspace", MASList: []MASCfg{{ID: "mas-default"}}},
			{WorkspaceID: "ws-other", WorkspaceName: "Other", MASList: []MASCfg{{ID: "mas-abc"}}},
		},
	})

	a := &App{}
	rtr := easyhttp.NewRouter()
	rtr.Get("/api/multi-agentic-systems/{masId}", a.getMASHandler)

	req := httptest.NewRequest(http.MethodGet, "/api/multi-agentic-systems/mas-abc", nil)
	w := httptest.NewRecorder()
	rtr.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d body=%s", http.StatusOK, w.Code, w.Body.String())
	}

	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}
	if resp["workspace_id"] != "ws-other" {
		t.Errorf("workspace_id = %v, want ws-other", resp["workspace_id"])
	}

	if len(paths) != 1 || paths[0] != "/api/workspaces/ws-other/multi-agentic-systems/mas-abc" {
		t.Fatalf("GetMAS paths = %v, want snapshot workspace ws-other", paths)
	}
}

// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/cisco-eti/ioc-scale-cfn-svc/pkg/tools/easyhttp"
)

func TestGetMASHandler_MissingMASID(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()

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
	setLastRefreshOK(false)
	CfnID = ""
	MgmtURL = "http://127.0.0.1:1"

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

func TestGetMASHandler_MgmtURLNotConfigured(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()

	seedParsedConfigFromMAS(map[string]any{
		"id":           "test-mas-id",
		"workspace_id": "test-workspace",
		"name":         "Test MAS",
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

func TestGetMASHandler_ResolvesAssignedWorkspace(t *testing.T) {
	masResp := map[string]any{
		"id":           "mas-abc",
		"workspace_id": "ws-other",
		"name":         "Other MAS",
		"cognition_engines": []map[string]any{
			{
				"ce_id":   "ce-1",
				"ce_type": "CASA",
				"enabled": true,
				"status":  "online",
			},
		},
	}

	cleanup, _ := setupTestEnv(t, masResp)
	defer cleanup()

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
}

func TestGetMASHandler_MASNotAssigned(t *testing.T) {
	cleanup, _ := setupTestEnv(t, nil)
	defer cleanup()

	a := &App{}
	rtr := easyhttp.NewRouter()
	rtr.Get("/api/multi-agentic-systems/{masId}", a.getMASHandler)

	req := httptest.NewRequest(http.MethodGet, "/api/multi-agentic-systems/unknown-mas", nil)
	w := httptest.NewRecorder()

	rtr.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected status %d, got %d body=%s", http.StatusNotFound, w.Code, w.Body.String())
	}
}

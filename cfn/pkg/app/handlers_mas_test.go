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
	WorkspaceID = "test-workspace"
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

func TestGetMASHandler_WorkspaceNotConfigured(t *testing.T) {
	// Clear workspace ID
	WorkspaceID = ""
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

	if resp["error"] != "workspace not configured" {
		t.Errorf("expected error 'workspace not configured', got '%s'", resp["error"])
	}
}

func TestGetMASHandler_MgmtURLNotConfigured(t *testing.T) {
	WorkspaceID = "test-workspace"
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

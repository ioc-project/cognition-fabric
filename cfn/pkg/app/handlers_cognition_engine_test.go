// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/cisco-eti/ioc-scale-cfn-svc/pkg/tools/easyhttp"
)

func TestRegisterCognitionEngineHandler_MissingCEType(t *testing.T) {
	// Reset global state
	CfnID = "test-cfn-id"

	a := &App{}
	handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

	body := `{"base_url": "http://localhost:8080", "endpoint": "/api/test"}`
	req := httptest.NewRequest(http.MethodPost, "/api/cognition-engine", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}

	var resp map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp["error"] != "ce_type is required" {
		t.Errorf("expected error 'ce_type is required', got '%s'", resp["error"])
	}
}

func TestRegisterCognitionEngineHandler_InvalidCEType(t *testing.T) {
	CfnID = "test-cfn-id"

	a := &App{}
	handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

	body := `{"ce_type": "INVALID", "base_url": "http://localhost:8080", "endpoint": "/api/test"}`
	req := httptest.NewRequest(http.MethodPost, "/api/cognition-engine", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}

	var resp map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp["error"] != "ce_type must be one of: CASA, DETECTIVE (got: INVALID)" {
		t.Errorf("unexpected error message: %s", resp["error"])
	}
}

func TestRegisterCognitionEngineHandler_MissingBaseURL(t *testing.T) {
	CfnID = "test-cfn-id"

	a := &App{}
	handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

	body := `{"ce_type": "CASA", "endpoint": "/api/test"}`
	req := httptest.NewRequest(http.MethodPost, "/api/cognition-engine", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}

	var resp map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp["error"] != "base_url is required" {
		t.Errorf("expected error 'base_url is required', got '%s'", resp["error"])
	}
}

func TestRegisterCognitionEngineHandler_InvalidBaseURL(t *testing.T) {
	CfnID = "test-cfn-id"

	a := &App{}
	handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

	body := `{"ce_type": "CASA", "base_url": "not-a-url", "endpoint": "/api/test"}`
	req := httptest.NewRequest(http.MethodPost, "/api/cognition-engine", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}

	var resp map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp["error"] != "invalid base_url format: must be a valid URL with scheme and host (e.g., http://host:port)" {
		t.Errorf("unexpected error message: %s", resp["error"])
	}
}

func TestRegisterCognitionEngineHandler_MissingEndpoint(t *testing.T) {
	CfnID = "test-cfn-id"

	a := &App{}
	handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

	body := `{"ce_type": "CASA", "base_url": "http://localhost:8080"}`
	req := httptest.NewRequest(http.MethodPost, "/api/cognition-engine", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}

	var resp map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp["error"] != "endpoint is required" {
		t.Errorf("expected error 'endpoint is required', got '%s'", resp["error"])
	}
}

func TestRegisterCognitionEngineHandler_CFNNotRegistered(t *testing.T) {
	// Simulate CFN not registered
	CfnID = ""

	a := &App{}
	handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

	body := `{"ce_type": "CASA", "base_url": "http://localhost:8080", "endpoint": "/api/test"}`
	req := httptest.NewRequest(http.MethodPost, "/api/cognition-engine", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected status %d, got %d", http.StatusServiceUnavailable, w.Code)
	}

	var resp map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp["error"] != "CFN not registered with management plane yet" {
		t.Errorf("unexpected error message: %s", resp["error"])
	}
}

func TestRegisterCognitionEngineHandler_InvalidJSON(t *testing.T) {
	CfnID = "test-cfn-id"

	a := &App{}
	handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

	body := `{invalid json}`
	req := httptest.NewRequest(http.MethodPost, "/api/cognition-engine", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}
}

func TestCognitionEngineHeartbeatHandler_MissingCEID(t *testing.T) {
	CfnID = "test-cfn-id"

	a := &App{}
	handler := easyhttp.WrapHandler(a.cognitionEngineHeartbeatHandler)

	req := httptest.NewRequest(http.MethodPut, "/api/cognition-engine//heartbeat", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}
}

func TestCognitionEngineHeartbeatHandler_InvalidCEID(t *testing.T) {
	CfnID = "test-cfn-id"

	a := &App{}
	rtr := easyhttp.NewRouter()
	rtr.Put("/api/cognition-engine/{ceId}/heartbeat", a.cognitionEngineHeartbeatHandler)

	req := httptest.NewRequest(http.MethodPut, "/api/cognition-engine/not-a-uuid/heartbeat", nil)
	w := httptest.NewRecorder()

	rtr.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}

	var resp map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp["error"] != "invalid ce_id format: must be a valid UUID" {
		t.Errorf("unexpected error message: %s", resp["error"])
	}
}

func TestCognitionEngineHeartbeatHandler_CFNNotRegistered(t *testing.T) {
	CfnID = ""

	a := &App{}
	rtr := easyhttp.NewRouter()
	rtr.Put("/api/cognition-engine/{ceId}/heartbeat", a.cognitionEngineHeartbeatHandler)

	req := httptest.NewRequest(http.MethodPut, "/api/cognition-engine/550e8400-e29b-41d4-a716-446655440000/heartbeat", nil)
	w := httptest.NewRecorder()

	rtr.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected status %d, got %d", http.StatusServiceUnavailable, w.Code)
	}

	var resp map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp["error"] != "CFN not registered with management plane yet" {
		t.Errorf("unexpected error message: %s", resp["error"])
	}
}

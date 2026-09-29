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

func TestRegisterCognitionEngineHandler_MissingName(t *testing.T) {
	// Reset global state
	CfnID = "test-cfn-id"

	a := &App{}
	handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

	body := `{"version": "1.0.0", "ce_type": "CASA", "base_url": "http://localhost:8080", "endpoint": "/api/test"}`
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

	if resp["error"] != "name is required" {
		t.Errorf("expected error 'name is required', got '%s'", resp["error"])
	}
}

func TestRegisterCognitionEngineHandler_MissingVersion(t *testing.T) {
	CfnID = "test-cfn-id"

	a := &App{}
	handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

	body := `{"name": "test-ce", "ce_type": "CASA", "base_url": "http://localhost:8080", "endpoint": "/api/test"}`
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

	if resp["error"] != "version is required" {
		t.Errorf("expected error 'version is required', got '%s'", resp["error"])
	}
}

func TestRegisterCognitionEngineHandler_MissingCEType(t *testing.T) {
	CfnID = "test-cfn-id"

	a := &App{}
	handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

	body := `{"name": "test-ce", "version": "1.0.0", "base_url": "http://localhost:8080", "endpoint": "/api/test"}`
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

	body := `{"name": "test-ce", "version": "1.0.0", "ce_type": "INVALID", "base_url": "http://localhost:8080", "endpoint": "/api/test"}`
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

	body := `{"name": "test-ce", "version": "1.0.0", "ce_type": "CASA", "endpoint": "/api/test"}`
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

	// "not-a-url" has no colon, so it's invalid for both gRPC (host:port) and HTTP formats
	body := `{"name": "test-ce", "version": "1.0.0", "ce_type": "CASA", "base_url": "not-a-url", "endpoint": "/api/test"}`
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

	if resp["error"] != "invalid base_url format: must be host:port (for gRPC) or http://host:port (for HTTP)" {
		t.Errorf("unexpected error message: %s", resp["error"])
	}
}

func TestRegisterCognitionEngineHandler_MissingEndpoint(t *testing.T) {
	CfnID = "test-cfn-id"

	a := &App{}
	handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

	body := `{"name": "test-ce", "version": "1.0.0", "ce_type": "CASA", "base_url": "http://localhost:8080"}`
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

	body := `{"name": "test-ce", "version": "1.0.0", "ce_type": "CASA", "base_url": "http://localhost:8080", "endpoint": "/api/test"}`
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

func TestRegisterCognitionEngineHandler_CASATypeAccepted(t *testing.T) {
	CfnID = "test-cfn-id"

	mockMgmtPlane := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"ce_id":"test-ce-id","cfn_id":"test-cfn-id","ce_type":"CASA","base_url":"http://localhost:8080","endpoint":"/api/test","enabled":true,"mas_auto_associate":true,"status":"offline","created":true}`))
	}))
	defer mockMgmtPlane.Close()

	t.Setenv("MGMT_URL", mockMgmtPlane.URL)

	a := &App{}
	handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

	body := `{"ce_type": "CASA", "base_url": "http://localhost:8080", "endpoint": "/api/test"}`
	req := httptest.NewRequest(http.MethodPost, "/api/cognition-engine", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d, body=%s", http.StatusOK, w.Code, w.Body.String())
	}
}

func TestRegisterCognitionEngineHandler_MASAutoAssociateDefault(t *testing.T) {
	CfnID = "test-cfn-id"

	// Track what was sent to management plane
	var receivedPayload map[string]any

	mockMgmtPlane := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&receivedPayload)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte(`{"ce_id":"test-ce-id","cfn_id":"test-cfn-id","name":"test-ce","version":"1.0.0","ce_type":"CASA","base_url":"http://localhost:8080","endpoint":"/api/test","enabled":true,"mas_auto_associate":true,"status":"online","created":true}`))
	}))
	defer mockMgmtPlane.Close()

	t.Setenv("MGMT_URL", mockMgmtPlane.URL)

	a := &App{}
	handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

	// Request without mas_auto_associate field
	body := `{"name": "test-ce", "version": "1.0.0", "ce_type": "CASA", "base_url": "http://localhost:8080", "endpoint": "/api/test"}`
	req := httptest.NewRequest(http.MethodPost, "/api/cognition-engine", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	// CFN forwards the management plane's status code (201 for new registration)
	if w.Code != http.StatusCreated {
		t.Errorf("expected status %d, got %d: %s", http.StatusCreated, w.Code, w.Body.String())
	}

	// Verify default value of true was sent to management plane
	if receivedPayload["mas_auto_associate"] != true {
		t.Errorf("expected mas_auto_associate to default to true, got %v", receivedPayload["mas_auto_associate"])
	}
}

func TestRegisterCognitionEngineHandler_MASAutoAssociateExplicitFalse(t *testing.T) {
	CfnID = "test-cfn-id"

	var receivedPayload map[string]any

	mockMgmtPlane := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&receivedPayload)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte(`{"ce_id":"test-ce-id","cfn_id":"test-cfn-id","name":"test-ce","version":"1.0.0","ce_type":"CASA","base_url":"http://localhost:8080","endpoint":"/api/test","enabled":true,"mas_auto_associate":false,"status":"online","created":true}`))
	}))
	defer mockMgmtPlane.Close()

	t.Setenv("MGMT_URL", mockMgmtPlane.URL)

	a := &App{}
	handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

	// Request with explicit mas_auto_associate: false
	body := `{"name": "test-ce", "version": "1.0.0", "ce_type": "CASA", "base_url": "http://localhost:8080", "endpoint": "/api/test", "mas_auto_associate": false}`
	req := httptest.NewRequest(http.MethodPost, "/api/cognition-engine", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	// CFN forwards the management plane's status code (201 for new registration)
	if w.Code != http.StatusCreated {
		t.Errorf("expected status %d, got %d: %s", http.StatusCreated, w.Code, w.Body.String())
	}

	// Verify explicit false was sent to management plane
	if receivedPayload["mas_auto_associate"] != false {
		t.Errorf("expected mas_auto_associate to be false, got %v", receivedPayload["mas_auto_associate"])
	}
}

func TestRegisterCognitionEngineHandler_MASAutoAssociateExplicitTrue(t *testing.T) {
	CfnID = "test-cfn-id"

	var receivedPayload map[string]any

	mockMgmtPlane := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&receivedPayload)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte(`{"ce_id":"test-ce-id","cfn_id":"test-cfn-id","name":"test-ce","version":"1.0.0","ce_type":"CASA","base_url":"http://localhost:8080","endpoint":"/api/test","enabled":true,"mas_auto_associate":true,"status":"online","created":true}`))
	}))
	defer mockMgmtPlane.Close()

	t.Setenv("MGMT_URL", mockMgmtPlane.URL)

	a := &App{}
	handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

	// Request with explicit mas_auto_associate: true
	body := `{"name": "test-ce", "version": "1.0.0", "ce_type": "CASA", "base_url": "http://localhost:8080", "endpoint": "/api/test", "mas_auto_associate": true}`
	req := httptest.NewRequest(http.MethodPost, "/api/cognition-engine", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	// CFN forwards the management plane's status code (201 for new registration)
	if w.Code != http.StatusCreated {
		t.Errorf("expected status %d, got %d: %s", http.StatusCreated, w.Code, w.Body.String())
	}

	// Verify explicit true was sent to management plane
	if receivedPayload["mas_auto_associate"] != true {
		t.Errorf("expected mas_auto_associate to be true, got %v", receivedPayload["mas_auto_associate"])
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

// DELETE handler tests

func TestDeleteCognitionEngineHandler(t *testing.T) {
	tests := []struct {
		name               string
		ceID               string
		cfnRegistered      bool
		mgmtPlaneStatus    int
		mgmtPlaneResponse  string
		expectedStatusCode int
		expectError        bool
	}{
		{
			name:               "successful deletion",
			ceID:               "550e8400-e29b-41d4-a716-446655440000",
			cfnRegistered:      true,
			mgmtPlaneStatus:    http.StatusNoContent,
			mgmtPlaneResponse:  "",
			expectedStatusCode: http.StatusNoContent,
			expectError:        false,
		},
		{
			name:               "CE not found",
			ceID:               "550e8400-e29b-41d4-a716-446655440001",
			cfnRegistered:      true,
			mgmtPlaneStatus:    http.StatusNotFound,
			mgmtPlaneResponse:  `{"detail":"CE not found"}`,
			expectedStatusCode: http.StatusNotFound,
			expectError:        true,
		},
		{
			name:               "invalid CE ID format",
			ceID:               "invalid-uuid",
			cfnRegistered:      true,
			mgmtPlaneStatus:    0,
			mgmtPlaneResponse:  "",
			expectedStatusCode: http.StatusBadRequest,
			expectError:        true,
		},
		{
			name:               "CFN not registered",
			ceID:               "550e8400-e29b-41d4-a716-446655440000",
			cfnRegistered:      false,
			mgmtPlaneStatus:    0,
			mgmtPlaneResponse:  "",
			expectedStatusCode: http.StatusServiceUnavailable,
			expectError:        true,
		},
		{
			name:               "CE must be disabled first",
			ceID:               "550e8400-e29b-41d4-a716-446655440000",
			cfnRegistered:      true,
			mgmtPlaneStatus:    http.StatusConflict,
			mgmtPlaneResponse:  `{"detail":"CE must be disabled before it can be deleted"}`,
			expectedStatusCode: http.StatusConflict,
			expectError:        true,
		},
		{
			name:               "CE has active MAS associations",
			ceID:               "550e8400-e29b-41d4-a716-446655440000",
			cfnRegistered:      true,
			mgmtPlaneStatus:    http.StatusConflict,
			mgmtPlaneResponse:  `{"detail":"CE cannot be deleted while it has active MAS associations"}`,
			expectedStatusCode: http.StatusConflict,
			expectError:        true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup mock management plane
			mockMgmtPlane := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != http.MethodDelete {
					t.Errorf("expected DELETE method, got %s", r.Method)
				}
				if tt.mgmtPlaneStatus == http.StatusNoContent {
					w.WriteHeader(http.StatusNoContent)
				} else {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(tt.mgmtPlaneStatus)
					w.Write([]byte(tt.mgmtPlaneResponse))
				}
			}))
			defer mockMgmtPlane.Close()

			// Set environment
			t.Setenv("MGMT_URL", mockMgmtPlane.URL)

			// Setup app
			app := &App{}

			// Set CFN registration status
			if tt.cfnRegistered {
				CfnID = "test-cfn-id"
			} else {
				CfnID = ""
			}

			// Create request with router to handle path params
			rtr := easyhttp.NewRouter()
			rtr.Delete("/api/cognition-engine/{ceId}", app.deleteCognitionEngineHandler)

			req := httptest.NewRequest(http.MethodDelete, "/api/cognition-engine/"+tt.ceID, nil)
			w := httptest.NewRecorder()

			// Execute handler
			rtr.ServeHTTP(w, req)

			// Verify status code
			if w.Code != tt.expectedStatusCode {
				t.Errorf("expected status code %d, got %d", tt.expectedStatusCode, w.Code)
			}

			// Verify error expectation
			if tt.expectError && w.Body.Len() > 0 {
				var response map[string]interface{}
				if err := json.Unmarshal(w.Body.Bytes(), &response); err == nil {
					if response["error"] == nil && response["detail"] == nil {
						t.Error("expected error in response body")
					}
				}
			}

			if !tt.expectError && tt.expectedStatusCode == http.StatusNoContent {
				// Success case should have no content
				if w.Body.Len() > 0 {
					t.Errorf("expected empty body for 204 response, got: %s", w.Body.String())
				}
			}
		})
	}
}

func TestDeleteCognitionEngineHandler_MissingCEID(t *testing.T) {
	CfnID = "test-cfn-id"

	a := &App{}
	rtr := easyhttp.NewRouter()
	rtr.Delete("/api/cognition-engine/{ceId}", a.deleteCognitionEngineHandler)

	req := httptest.NewRequest(http.MethodDelete, "/api/cognition-engine/", nil)
	w := httptest.NewRecorder()

	rtr.ServeHTTP(w, req)

	// Should get 404 because route doesn't match
	if w.Code != http.StatusNotFound {
		t.Errorf("expected status %d (route not found), got %d", http.StatusNotFound, w.Code)
	}
}

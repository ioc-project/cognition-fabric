// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/ioc-project/cognition-fabric/cfn/pkg/tools/easyhttp"
)

func TestRegisterCognitionEngineHandler_MissingName(t *testing.T) {
	// Reset global state
	CfnID = "test-cfn-id"

	a := &App{}
	handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

	body := `{"version": "1.0.0", "ce_type": "CASA", "enforcing_url": "http://localhost:8080", "enforcing_endpoint": "/api/test", "health_url": "http://localhost:8080", "health_endpoint": "/healthz"}`
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

	body := `{"name": "test-ce", "ce_type": "CASA", "enforcing_url": "http://localhost:8080", "enforcing_endpoint": "/api/test", "health_url": "http://localhost:8080", "health_endpoint": "/healthz"}`
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

	body := `{"name": "test-ce", "version": "1.0.0", "enforcing_url": "http://localhost:8080", "enforcing_endpoint": "/api/test", "health_url": "http://localhost:8080", "health_endpoint": "/healthz"}`
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

	body := `{"name": "test-ce", "version": "1.0.0", "ce_type": "INVALID", "enforcing_url": "http://localhost:8080", "enforcing_endpoint": "/api/test", "health_url": "http://localhost:8080", "health_endpoint": "/healthz"}`
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

func TestRegisterCognitionEngineHandler_EndpointWithoutEnforcingURL(t *testing.T) {
	CfnID = "test-cfn-id"

	a := &App{}
	handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

	body := `{"name": "test-ce", "version": "1.0.0", "ce_type": "CASA", "enforcing_endpoint": "/api/test", "health_url": "http://localhost:8080", "health_endpoint": "/healthz"}`
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

	if resp["error"] != "enforcing_url and enforcing_endpoint must be set together" {
		t.Errorf("unexpected error message: '%s'", resp["error"])
	}
}

func TestRegisterCognitionEngineHandler_InvalidEnforcingURL(t *testing.T) {
	CfnID = "test-cfn-id"

	a := &App{}
	handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

	// "not-a-url" has no colon, so it's invalid for both gRPC (host:port) and HTTP formats
	body := `{"name": "test-ce", "version": "1.0.0", "ce_type": "CASA", "enforcing_url": "not-a-url", "enforcing_endpoint": "/api/test", "health_url": "http://localhost:8080", "health_endpoint": "/healthz"}`
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

	if resp["error"] != "invalid enforcing_url format: must be host:port (for gRPC) or http://host:port (for HTTP)" {
		t.Errorf("unexpected error message: %s", resp["error"])
	}
}

func TestRegisterCognitionEngineHandler_MissingEndpoint(t *testing.T) {
	CfnID = "test-cfn-id"

	a := &App{}
	handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

	body := `{"name": "test-ce", "version": "1.0.0", "ce_type": "CASA", "enforcing_url": "http://localhost:8080"}`
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

	if resp["error"] != "enforcing_url and enforcing_endpoint must be set together" {
		t.Errorf("unexpected error message: '%s'", resp["error"])
	}
}

func TestRegisterCognitionEngineHandler_CFNNotRegistered(t *testing.T) {
	// Simulate CFN not registered
	CfnID = ""

	a := &App{}
	handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

	body := `{"name": "test-ce", "version": "1.0.0", "ce_type": "CASA", "enforcing_url": "http://localhost:8080", "enforcing_endpoint": "/api/test", "health_url": "http://localhost:8080", "health_endpoint": "/healthz"}`
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
		w.Write([]byte(`{"ce_id":"test-ce-id","cfn_id":"test-cfn-id","name":"casa-ce","version":"1.0.0","ce_type":"CASA","enforcing_url":"http://localhost:8080","enforcing_endpoint":"/api/test","enabled":true,"mas_auto_associate":true,"status":"offline","created":true}`))
	}))
	defer mockMgmtPlane.Close()

	t.Setenv("MGMT_URL", mockMgmtPlane.URL)

	a := &App{}
	handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

	body := `{"name": "casa-ce", "version": "1.0.0", "ce_type": "CASA", "enforcing_url": "http://localhost:8080", "enforcing_endpoint": "/api/test", "health_url": "http://localhost:8080", "health_endpoint": "/healthz"}`
	req := httptest.NewRequest(http.MethodPost, "/api/cognition-engine", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d, body=%s", http.StatusOK, w.Code, w.Body.String())
	}
}

func TestRegisterCognitionEngineHandler_EnforcingOptional(t *testing.T) {
	CfnID = "test-cfn-id"

	var receivedPayload map[string]any
	mockMgmtPlane := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&receivedPayload)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte(`{"ce_id":"test-ce-id","cfn_id":"test-cfn-id","name":"test-ce","version":"1.0.0","ce_type":"DETECTIVE","enabled":true,"status":"online","created":true}`))
	}))
	defer mockMgmtPlane.Close()
	t.Setenv("MGMT_URL", mockMgmtPlane.URL)

	a := &App{}
	handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

	body := `{"name": "test-ce", "version": "1.0.0", "ce_type": "DETECTIVE", "health_url": "http://localhost:8080", "health_endpoint": "/healthz"}`
	req := httptest.NewRequest(http.MethodPost, "/api/cognition-engine", bytes.NewBufferString(body))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d, body=%s", http.StatusCreated, w.Code, w.Body.String())
	}
	if _, sent := receivedPayload["enforcing_url"]; sent {
		t.Errorf("enforcing_url should not be forwarded when omitted: %v", receivedPayload)
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
		w.Write([]byte(`{"ce_id":"test-ce-id","cfn_id":"test-cfn-id","name":"test-ce","version":"1.0.0","ce_type":"CASA","enforcing_url":"http://localhost:8080","enforcing_endpoint":"/api/test","enabled":true,"mas_auto_associate":true,"status":"online","created":true}`))
	}))
	defer mockMgmtPlane.Close()

	t.Setenv("MGMT_URL", mockMgmtPlane.URL)

	a := &App{}
	handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

	// Request without mas_auto_associate field
	body := `{"name": "test-ce", "version": "1.0.0", "ce_type": "CASA", "enforcing_url": "http://localhost:8080", "enforcing_endpoint": "/api/test", "health_url": "http://localhost:8080", "health_endpoint": "/healthz"}`
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
		w.Write([]byte(`{"ce_id":"test-ce-id","cfn_id":"test-cfn-id","name":"test-ce","version":"1.0.0","ce_type":"CASA","enforcing_url":"http://localhost:8080","enforcing_endpoint":"/api/test","enabled":true,"mas_auto_associate":false,"status":"online","created":true}`))
	}))
	defer mockMgmtPlane.Close()

	t.Setenv("MGMT_URL", mockMgmtPlane.URL)

	a := &App{}
	handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

	// Request with explicit mas_auto_associate: false
	body := `{"name": "test-ce", "version": "1.0.0", "ce_type": "CASA", "enforcing_url": "http://localhost:8080", "enforcing_endpoint": "/api/test", "health_url": "http://localhost:8080", "health_endpoint": "/healthz", "mas_auto_associate": false}`
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
		w.Write([]byte(`{"ce_id":"test-ce-id","cfn_id":"test-cfn-id","name":"test-ce","version":"1.0.0","ce_type":"CASA","enforcing_url":"http://localhost:8080","enforcing_endpoint":"/api/test","enabled":true,"mas_auto_associate":true,"status":"online","created":true}`))
	}))
	defer mockMgmtPlane.Close()

	t.Setenv("MGMT_URL", mockMgmtPlane.URL)

	a := &App{}
	handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

	// Request with explicit mas_auto_associate: true
	body := `{"name": "test-ce", "version": "1.0.0", "ce_type": "CASA", "enforcing_url": "http://localhost:8080", "enforcing_endpoint": "/api/test", "health_url": "http://localhost:8080", "health_endpoint": "/healthz", "mas_auto_associate": true}`
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

// PATCH handler tests

func TestPatchCognitionEngineHandler(t *testing.T) {
	tests := []struct {
		name               string
		ceID               string
		cfnRegistered      bool
		requestBody        string
		mgmtPlaneStatus    int
		mgmtPlaneResponse  string
		expectedStatusCode int
		expectError        bool
	}{
		{
			name:               "successful patch",
			ceID:               "550e8400-e29b-41d4-a716-446655440000",
			cfnRegistered:      true,
			requestBody:        `{"enforcing_url": "localhost:50052", "enforcing_endpoint": "ioc.ce.v1.CognitionEngine"}`,
			mgmtPlaneStatus:    http.StatusOK,
			mgmtPlaneResponse:  `{"id":"550e8400-e29b-41d4-a716-446655440000","cfn_id":"test-cfn-id","name":"demo-ce","version":"1.0.0","ce_type":"CASA","enforcing_url":"localhost:50052","enforcing_endpoint":"ioc.ce.v1.CognitionEngine","enabled":true,"mas_auto_associate":true,"status":"online"}`,
			expectedStatusCode: http.StatusOK,
			expectError:        false,
		},
		{
			name:               "CE not found",
			ceID:               "550e8400-e29b-41d4-a716-446655440001",
			cfnRegistered:      true,
			requestBody:        `{"enforcing_url": "localhost:50052"}`,
			mgmtPlaneStatus:    http.StatusNotFound,
			mgmtPlaneResponse:  `{"detail":"CE not found"}`,
			expectedStatusCode: http.StatusNotFound,
			expectError:        true,
		},
		{
			name:               "invalid CE ID format",
			ceID:               "invalid-uuid",
			cfnRegistered:      true,
			requestBody:        `{"enforcing_url": "localhost:50052"}`,
			mgmtPlaneStatus:    0,
			mgmtPlaneResponse:  "",
			expectedStatusCode: http.StatusBadRequest,
			expectError:        true,
		},
		{
			name:               "CFN not registered",
			ceID:               "550e8400-e29b-41d4-a716-446655440000",
			cfnRegistered:      false,
			requestBody:        `{"enforcing_url": "localhost:50052"}`,
			mgmtPlaneStatus:    0,
			mgmtPlaneResponse:  "",
			expectedStatusCode: http.StatusServiceUnavailable,
			expectError:        true,
		},
		{
			name:               "invalid JSON body",
			ceID:               "550e8400-e29b-41d4-a716-446655440000",
			cfnRegistered:      true,
			requestBody:        `{invalid json}`,
			mgmtPlaneStatus:    0,
			mgmtPlaneResponse:  "",
			expectedStatusCode: http.StatusBadRequest,
			expectError:        true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup mock management plane
			mockMgmtPlane := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != http.MethodPatch {
					t.Errorf("expected PATCH method, got %s", r.Method)
				}
				if want := "/api/cognition-engines/" + tt.ceID; r.URL.Path != want {
					t.Errorf("expected existing PATCH route %s, got %s", want, r.URL.Path)
				}
				if got := r.URL.Query().Get("reconnect"); got != "true" {
					t.Errorf("expected reconnect=true query parameter, got %q", got)
				}
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(tt.mgmtPlaneStatus)
				w.Write([]byte(tt.mgmtPlaneResponse))
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
			rtr.Patch("/api/cognition-engine/{ceId}", app.patchCognitionEngineHandler)

			req := httptest.NewRequest(http.MethodPatch, "/api/cognition-engine/"+tt.ceID, bytes.NewBufferString(tt.requestBody))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			// Execute handler
			rtr.ServeHTTP(w, req)

			// Verify status code
			if w.Code != tt.expectedStatusCode {
				t.Errorf("expected status code %d, got %d: %s", tt.expectedStatusCode, w.Code, w.Body.String())
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

			// Verify successful response contains expected fields
			if !tt.expectError && tt.expectedStatusCode == http.StatusOK {
				var response map[string]interface{}
				if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
					t.Fatalf("failed to unmarshal response: %v", err)
				}
				if response["id"] == nil && response["ce_id"] == nil {
					t.Error("expected id or ce_id in response body")
				}
			}
		})
	}
}

func TestPatchCognitionEngineHandler_VerifyPayloadForwarded(t *testing.T) {
	CfnID = "test-cfn-id"

	var receivedPayload map[string]any

	mockMgmtPlane := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&receivedPayload)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"id":"550e8400-e29b-41d4-a716-446655440000","enforcing_url":"localhost:50052","enforcing_endpoint":"ioc.ce.v1.CognitionEngine"}`))
	}))
	defer mockMgmtPlane.Close()

	t.Setenv("MGMT_URL", mockMgmtPlane.URL)

	app := &App{}
	rtr := easyhttp.NewRouter()
	rtr.Patch("/api/cognition-engine/{ceId}", app.patchCognitionEngineHandler)

	body := `{"enforcing_url": "localhost:50052", "enforcing_endpoint": "ioc.ce.v1.CognitionEngine"}`
	req := httptest.NewRequest(http.MethodPatch, "/api/cognition-engine/550e8400-e29b-41d4-a716-446655440000", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	rtr.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d: %s", http.StatusOK, w.Code, w.Body.String())
	}

	// Verify payload was forwarded correctly
	if receivedPayload["enforcing_url"] != "localhost:50052" {
		t.Errorf("expected enforcing_url 'localhost:50052', got %v", receivedPayload["enforcing_url"])
	}
	if receivedPayload["enforcing_endpoint"] != "ioc.ce.v1.CognitionEngine" {
		t.Errorf("expected endpoint 'ioc.ce.v1.CognitionEngine', got %v", receivedPayload["enforcing_endpoint"])
	}
}

// health_url validation and probe tests

func TestRegisterCognitionEngineHandler_MissingHealthURL(t *testing.T) {
	a := &App{}
	handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

	body := `{"name": "test-ce", "version": "1.0.0", "ce_type": "CASA", "enforcing_url": "http://localhost:8080", "enforcing_endpoint": "/api/test"}`
	req := httptest.NewRequest(http.MethodPost, "/api/cognition-engine", bytes.NewBufferString(body))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}
	var resp map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}
	if resp["error"] != "health_url is required" {
		t.Errorf("unexpected error message: %s", resp["error"])
	}
}

func TestRegisterCognitionEngineHandler_MissingHealthEndpoint(t *testing.T) {
	CfnID = "test-cfn-id"
	a := &App{}
	handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

	body := `{"name": "test-ce", "version": "1.0.0", "ce_type": "CASA", "enforcing_url": "localhost:50051", "enforcing_endpoint": "ioc.ce.v1.CognitionEngine", "health_url": "http://localhost:8080"}`
	req := httptest.NewRequest(http.MethodPost, "/api/cognition-engine", bytes.NewBufferString(body))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "health_endpoint is required") {
		t.Fatalf("expected 400 health_endpoint is required, got %d: %s", w.Code, w.Body.String())
	}
}

func TestFindEngineHealthURL_JoinsEndpoint(t *testing.T) {
	for _, base := range []string{"http://ce:8080", "http://ce:8080/"} {
		cfnConfigMutex.Lock()
		prev := ParsedConfig
		ParsedConfig = &CfnConfigPayload{CognitionEngines: []EngineCfg{{ID: probeTestCEID, HealthURL: base, HealthEndpoint: "/healthz"}}}
		cfnConfigMutex.Unlock()

		got, found := findEngineHealthURL(probeTestCEID)

		cfnConfigMutex.Lock()
		ParsedConfig = prev
		cfnConfigMutex.Unlock()
		if !found || got != "http://ce:8080/healthz" {
			t.Errorf("base %q: got %q (found=%v)", base, got, found)
		}
	}
}

func TestRegisterCognitionEngineHandler_InvalidHealthURL(t *testing.T) {
	for _, healthURL := range invalidHealthURLs {
		a := &App{}
		handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

		body := `{"name": "test-ce", "version": "1.0.0", "ce_type": "CASA", "enforcing_url": "http://localhost:8080", "enforcing_endpoint": "/api/test", "health_url": "` + healthURL + `"}`
		req := httptest.NewRequest(http.MethodPost, "/api/cognition-engine", bytes.NewBufferString(body))
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("health_url %q: expected status %d, got %d", healthURL, http.StatusBadRequest, w.Code)
		}
	}
}

var invalidHealthURLs = []string{
	"localhost:8080/healthz",
	"ftp://host/healthz",
	"http://",
	"http://:8080/healthz",
	"/healthz",
	"http://user:pw@host:8080/healthz",
	"http://host:8080/healthz#frag",
	"http://169.254.169.254/latest/meta-data",
	"http://[fe80::1]:8080/healthz",
}

func TestValidateHealthURL(t *testing.T) {
	for _, valid := range []string{"http://host/healthz", "https://host:8443/healthz", "http://10.0.0.5:8080/live?x=1", "http://127.0.0.1:8080/healthz", "http://[::1]:8080/healthz"} {
		if err := validateHealthURL(valid); err != nil {
			t.Errorf("%q should be valid, got %v", valid, err)
		}
	}
	for _, invalid := range append([]string{""}, invalidHealthURLs...) {
		if err := validateHealthURL(invalid); err == nil {
			t.Errorf("%q should be invalid", invalid)
		}
	}
	if err := validateHealthURL(""); err == nil || err.Error() != "health_url is required" {
		t.Errorf("empty health_url should report it is required, got %v", err)
	}
}

func TestValidateHealthURLValue(t *testing.T) {
	for _, v := range []any{"not-a-url", "", 5, nil, true} {
		if err := validateHealthURLValue(v); err == nil {
			t.Errorf("%#v should be rejected", v)
		}
	}
	if err := validateHealthURLValue("http://host:8080/healthz"); err != nil {
		t.Errorf("a valid URL was rejected: %v", err)
	}
}

func TestParseProbeTimeout(t *testing.T) {
	valid := map[string]time.Duration{"1": time.Second, "0.5": 500 * time.Millisecond, "10": 10 * time.Second}
	for raw, want := range valid {
		got, err := parseProbeTimeout(raw)
		if err != nil || got != want {
			t.Errorf("parseProbeTimeout(%q) = %v, %v; want %v", raw, got, err, want)
		}
	}
	for _, raw := range []string{"", "abc", "0", "-1", "10.5", "3600"} {
		if _, err := parseProbeTimeout(raw); err == nil {
			t.Errorf("parseProbeTimeout(%q) should fail", raw)
		}
	}
}

func TestProbeTimeoutFromEnv(t *testing.T) {
	t.Setenv("CE_PROBE_TIMEOUT_SECONDS", "2.5")
	if got := probeTimeoutFromEnv(); got != 2500*time.Millisecond {
		t.Errorf("expected 2.5s, got %v", got)
	}

	t.Setenv("CE_PROBE_TIMEOUT_SECONDS", "3600")
	if got := probeTimeoutFromEnv(); got != defaultProbeTimeout {
		t.Errorf("out of range value should fall back to default, got %v", got)
	}

	t.Setenv("CE_PROBE_TIMEOUT_SECONDS", "")
	if got := probeTimeoutFromEnv(); got != defaultProbeTimeout {
		t.Errorf("unset should use default, got %v", got)
	}

	if got := (&App{}).getProbeTimeout(); got != defaultProbeTimeout {
		t.Errorf("zero App timeout should use default, got %v", got)
	}
}

const probeTestCEID = "550e8400-e29b-41d4-a716-446655440000"

func setProbeTestConfig(t *testing.T, healthURL string) {
	t.Helper()
	prev := applyParsedConfig(&CfnConfigPayload{CognitionEngines: []EngineCfg{{ID: probeTestCEID, HealthURL: healthURL}}})
	t.Cleanup(func() {
		applyParsedConfig(prev)
	})
}

func postProbe(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()
	return postProbeTo(t, &App{}, body)
}

func postProbeTo(t *testing.T, a *App, body string) *httptest.ResponseRecorder {
	t.Helper()
	handler := easyhttp.WrapHandler(a.probeCognitionEngineHandler)
	req := httptest.NewRequest(http.MethodPost, "/api/internal/mgmt/cognition-engine/probe", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	return w
}

func TestProbeCognitionEngineHandler(t *testing.T) {
	ok := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer ok.Close()
	failing := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer failing.Close()
	redirecting := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, ok.URL, http.StatusFound)
	}))
	defer redirecting.Close()
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(2 * time.Second):
		}
	}))
	defer slow.Close()

	tests := []struct {
		name        string
		healthURL   string
		wantHealthy bool
	}{
		{"200 is healthy", ok.URL, true},
		{"non-200 is unhealthy", failing.URL, false},
		{"redirect is unhealthy", redirecting.URL, false},
		{"timeout is unhealthy", slow.URL, false},
		{"unreachable is unhealthy", "http://127.0.0.1:1", false},
		{"empty health_url is unhealthy", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			setProbeTestConfig(t, tt.healthURL)

			w := postProbeTo(t, &App{probeTimeout: 200 * time.Millisecond}, `{"ce_id": "`+probeTestCEID+`"}`)

			if w.Code != http.StatusOK {
				t.Fatalf("expected status %d, got %d: %s", http.StatusOK, w.Code, w.Body.String())
			}
			var resp map[string]bool
			if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
				t.Fatalf("failed to unmarshal response: %v", err)
			}
			if resp["healthy"] != tt.wantHealthy {
				t.Errorf("expected healthy=%v, got %v", tt.wantHealthy, resp["healthy"])
			}
		})
	}
}

func TestProbeCognitionEngineHandler_OversizedBody(t *testing.T) {
	big := `{"ce_id": "` + strings.Repeat("a", 4096) + `"}`
	w := postProbe(t, big)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}
}

func TestProbeCognitionEngineHandler_NoConfig(t *testing.T) {
	prev := applyParsedConfig(nil)
	defer applyParsedConfig(prev)

	w := postProbe(t, `{"ce_id": "`+probeTestCEID+`"}`)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected status %d, got %d", http.StatusNotFound, w.Code)
	}
}

func TestProbeCognitionEngineHandler_InvalidRequest(t *testing.T) {
	for _, body := range []string{`not json`, `{}`, `{"ce_id": "not-a-uuid"}`, `{"health_url": "http://host/healthz"}`} {
		w := postProbe(t, body)
		if w.Code != http.StatusBadRequest {
			t.Errorf("body %q: expected status %d, got %d", body, http.StatusBadRequest, w.Code)
		}
	}
}

func TestProbeCognitionEngineHandler_UsesRegisteredURLNotCaller(t *testing.T) {
	var hits atomic.Int32
	ok := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	defer ok.Close()
	setProbeTestConfig(t, ok.URL)

	// A caller-supplied URL is ignored: only the registered health_url is ever probed
	w := postProbe(t, `{"ce_id": "`+probeTestCEID+`", "health_url": "http://127.0.0.1:1/"}`)

	if w.Code != http.StatusOK || hits.Load() != 1 {
		t.Errorf("expected the registered URL to be probed once, status=%d hits=%d", w.Code, hits.Load())
	}
}

func TestProbeClientIgnoresProxyEnvironment(t *testing.T) {
	transport, ok := probeClient.Transport.(*http.Transport)
	if !ok {
		t.Fatalf("probe client should use an *http.Transport, got %T", probeClient.Transport)
	}
	if transport.Proxy != nil {
		t.Error("probe client must not use a proxy: HTTP_PROXY would answer probes for CEs that are down")
	}

	// A proxy that answers 200 for everything must not turn an unresolvable host into a healthy CE
	var proxied atomic.Int32
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxied.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	defer proxy.Close()
	t.Setenv("HTTP_PROXY", proxy.URL)
	t.Setenv("http_proxy", proxy.URL)

	healthy, _ := probeHealthURL(context.Background(), "http://ce.example.invalid:8080/healthz", 500*time.Millisecond)

	if healthy || proxied.Load() != 0 {
		t.Errorf("probe went through the proxy: healthy=%v proxied=%d", healthy, proxied.Load())
	}
}

func TestProbeCognitionEngineHandler_UnknownCE(t *testing.T) {
	setProbeTestConfig(t, "http://127.0.0.1:1/healthz")

	w := postProbe(t, `{"ce_id": "660e8400-e29b-41d4-a716-446655440001"}`)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected status %d, got %d", http.StatusNotFound, w.Code)
	}
	var resp map[string]string
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["error"] != "CE not yet in CFN config" {
		t.Errorf("unexpected error message: %s", resp["error"])
	}
}

func TestRegisterCognitionEngineHandler_ProtocolDefaultsForwarded(t *testing.T) {
	CfnID = "test-cfn-id"

	var receivedPayload map[string]any
	mockMgmtPlane := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&receivedPayload)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte(`{}`))
	}))
	defer mockMgmtPlane.Close()
	t.Setenv("MGMT_URL", mockMgmtPlane.URL)

	a := &App{}
	handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

	body := `{"name": "test-ce", "version": "1.0.0", "ce_type": "CASA", "enforcing_url": "localhost:50051", "enforcing_endpoint": "ioc.ce.v1.CognitionEngine", "health_url": "http://localhost:8080", "health_endpoint": "/healthz"}`
	req := httptest.NewRequest(http.MethodPost, "/api/cognition-engine", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d: %s", http.StatusCreated, w.Code, w.Body.String())
	}
	for field, want := range map[string]string{
		"enforcing_protocol":    "grpc",
		"health_protocol":       "http",
		"notification_protocol": "http",
		"enforcing_url":         "localhost:50051",
		"enforcing_endpoint":    "ioc.ce.v1.CognitionEngine",
	} {
		if receivedPayload[field] != want {
			t.Errorf("expected %s=%q forwarded, got %v", field, want, receivedPayload[field])
		}
	}
	if _, ok := receivedPayload["base_url"]; ok {
		t.Errorf("base_url must no longer be forwarded")
	}
}

func TestRegisterCognitionEngineHandler_UnsupportedProtocol(t *testing.T) {
	CfnID = "test-cfn-id"

	tests := []struct {
		name  string
		extra string
		want  string
	}{
		{"enforcing http", `"enforcing_protocol": "http"`, "enforcing_protocol must be 'grpc' (got: \"http\")"},
		{"health grpc", `"health_protocol": "grpc"`, "health_protocol must be 'http' (got: \"grpc\")"},
		{"notification grpc", `"notification_protocol": "grpc"`, "notification_protocol must be 'http' (got: \"grpc\")"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			a := &App{}
			handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

			body := `{"name": "test-ce", "version": "1.0.0", "ce_type": "CASA", "enforcing_url": "localhost:50051", "enforcing_endpoint": "ioc.ce.v1.CognitionEngine", "health_url": "http://localhost:8080", "health_endpoint": "/healthz", ` + tt.extra + `}`
			req := httptest.NewRequest(http.MethodPost, "/api/cognition-engine", bytes.NewBufferString(body))
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, req)

			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected status %d, got %d: %s", http.StatusBadRequest, w.Code, w.Body.String())
			}
			var resp map[string]string
			if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
				t.Fatalf("failed to unmarshal response: %v", err)
			}
			if resp["error"] != tt.want {
				t.Errorf("expected error %q, got %q", tt.want, resp["error"])
			}
		})
	}
}

func TestPatchCognitionEngineHandler_ProtocolValidation(t *testing.T) {
	CfnID = "test-cfn-id"

	tests := []struct {
		name string
		body string
		code int
	}{
		{"valid protocol accepted", `{"health_protocol": "http"}`, http.StatusOK},
		{"unsupported protocol rejected", `{"enforcing_protocol": "http"}`, http.StatusBadRequest},
		{"non-string protocol rejected", `{"notification_protocol": 1}`, http.StatusBadRequest},
		{"health_endpoint cannot be cleared", `{"health_endpoint": null}`, http.StatusBadRequest},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockMgmtPlane := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.Write([]byte(`{}`))
			}))
			defer mockMgmtPlane.Close()
			t.Setenv("MGMT_URL", mockMgmtPlane.URL)

			a := &App{}
			rtr := easyhttp.NewRouter()
			rtr.Patch("/api/cognition-engine/{ceId}", a.patchCognitionEngineHandler)

			req := httptest.NewRequest(http.MethodPatch, "/api/cognition-engine/550e8400-e29b-41d4-a716-446655440000", bytes.NewBufferString(tt.body))
			w := httptest.NewRecorder()
			rtr.ServeHTTP(w, req)

			if w.Code != tt.code {
				t.Errorf("expected status %d, got %d: %s", tt.code, w.Code, w.Body.String())
			}
		})
	}
}

func TestRegisterCognitionEngineHandler_EndpointRules(t *testing.T) {
	CfnID = "test-cfn-id"

	const base = `"name": "test-ce", "version": "1.0.0", "ce_type": "CASA", "enforcing_url": "localhost:50051", "enforcing_endpoint": "ioc.ce.v1.CognitionEngine", "health_url": "http://localhost:8080", "health_endpoint": "/healthz"`
	tests := []struct {
		name  string
		extra string
		want  string
	}{
		{"notification url without endpoint", `"notification_url": "http://localhost:8080"`, "notification_url and notification_endpoint must be set together"},
		{"notification endpoint without url", `"notification_endpoint": "/notifications"`, "notification_url and notification_endpoint must be set together"},
		{"notification endpoint without slash", `"notification_url": "http://localhost:8080", "notification_endpoint": "notifications"`, "notification_endpoint must start with '/'"},
		{"health endpoint without slash", `"health_endpoint": "healthz"`, "health_endpoint must start with '/'"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			a := &App{}
			handler := easyhttp.WrapHandler(a.registerCognitionEngineHandler)

			req := httptest.NewRequest(http.MethodPost, "/api/cognition-engine", bytes.NewBufferString(`{`+base+`, `+tt.extra+`}`))
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, req)

			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected status %d, got %d: %s", http.StatusBadRequest, w.Code, w.Body.String())
			}
			var resp map[string]string
			if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
				t.Fatalf("failed to unmarshal response: %v", err)
			}
			if resp["error"] != tt.want {
				t.Errorf("expected error %q, got %q", tt.want, resp["error"])
			}
		})
	}
}

func TestPatchCognitionEngineHandler_EndpointRules(t *testing.T) {
	CfnID = "test-cfn-id"

	tests := []struct {
		name string
		body string
		code int
	}{
		{"endpoint without slash rejected", `{"notification_endpoint": "notifications"}`, http.StatusBadRequest},
		{"null clears and is forwarded", `{"notification_url": null, "notification_endpoint": null}`, http.StatusOK},
		{"valid endpoint accepted", `{"health_endpoint": "/healthz"}`, http.StatusOK},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockMgmtPlane := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.Write([]byte(`{}`))
			}))
			defer mockMgmtPlane.Close()
			t.Setenv("MGMT_URL", mockMgmtPlane.URL)

			a := &App{}
			rtr := easyhttp.NewRouter()
			rtr.Patch("/api/cognition-engine/{ceId}", a.patchCognitionEngineHandler)

			req := httptest.NewRequest(http.MethodPatch, "/api/cognition-engine/550e8400-e29b-41d4-a716-446655440000", bytes.NewBufferString(tt.body))
			w := httptest.NewRecorder()
			rtr.ServeHTTP(w, req)

			if w.Code != tt.code {
				t.Errorf("expected status %d, got %d: %s", tt.code, w.Code, w.Body.String())
			}
		})
	}
}

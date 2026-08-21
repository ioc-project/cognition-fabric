// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	enforcementv1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/enforcement/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// setupTestEnv sets up the test environment with mock management plane and CASA CE.
// Returns cleanup function and the mock servers.
func setupTestEnv(t *testing.T, masResponse map[string]any, casaResponse map[string]any) (cleanup func(), mockMgmt *httptest.Server, mockCASA *httptest.Server) {
	t.Helper()

	// Save old values
	oldWorkspaceID := WorkspaceID
	oldMgmtURL := MgmtURL

	// Start mock CASA CE server
	mockCASA = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(casaResponse)
	}))

	// Inject CASA URL into MAS response if present
	if masResponse != nil {
		if ces, ok := masResponse["cognition_engines"].([]map[string]any); ok && len(ces) > 0 {
			ces[0]["base_url"] = mockCASA.URL
		}
	}

	// Start mock management plane server
	mockMgmt = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if masResponse == nil {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(masResponse)
	}))

	// Set global vars
	WorkspaceID = "ws-test-123"
	MgmtURL = mockMgmt.URL

	cleanup = func() {
		WorkspaceID = oldWorkspaceID
		MgmtURL = oldMgmtURL
		mockMgmt.Close()
		mockCASA.Close()
	}

	return cleanup, mockMgmt, mockCASA
}

func TestGetDisposition_MissingPayload(t *testing.T) {
	server := newEnforcementServer()

	req := &enforcementv1.GetDispositionRequest{
		Payload: nil,
	}

	_, err := server.GetDisposition(context.Background(), req)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	st, ok := status.FromError(err)
	if !ok {
		t.Fatalf("expected gRPC status error, got %v", err)
	}

	if st.Code() != codes.InvalidArgument {
		t.Errorf("expected code %v, got %v", codes.InvalidArgument, st.Code())
	}

	if st.Message() != "payload is required" {
		t.Errorf("expected message 'payload is required', got '%s'", st.Message())
	}
}

func TestGetDisposition_MissingMASID(t *testing.T) {
	server := newEnforcementServer()

	req := &enforcementv1.GetDispositionRequest{
		Payload: &enforcementv1.GetDispositionPayload{
			MasId:              "",
			SourceAgentId:      "agent-1",
			DestinationAgentId: "agent-2",
			TraceId:            "trace-123",
		},
	}

	_, err := server.GetDisposition(context.Background(), req)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	st, ok := status.FromError(err)
	if !ok {
		t.Fatalf("expected gRPC status error, got %v", err)
	}

	if st.Code() != codes.InvalidArgument {
		t.Errorf("expected code %v, got %v", codes.InvalidArgument, st.Code())
	}

	if st.Message() != "mas_id is required" {
		t.Errorf("expected message 'mas_id is required', got '%s'", st.Message())
	}
}

func TestGetDisposition_WorkspaceIDNotSet(t *testing.T) {
	// Save and clear workspace ID
	oldWorkspaceID := WorkspaceID
	oldMgmtURL := MgmtURL
	WorkspaceID = ""
	MgmtURL = "http://localhost:9000"

	defer func() {
		WorkspaceID = oldWorkspaceID
		MgmtURL = oldMgmtURL
	}()

	server := newEnforcementServer()

	req := &enforcementv1.GetDispositionRequest{
		Payload: &enforcementv1.GetDispositionPayload{
			MasId:              "mas-123",
			SourceAgentId:      "agent-1",
			DestinationAgentId: "agent-2",
			TraceId:            "trace-123",
		},
	}

	_, err := server.GetDisposition(context.Background(), req)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	st, ok := status.FromError(err)
	if !ok {
		t.Fatalf("expected gRPC status error, got %v", err)
	}

	if st.Code() != codes.Unavailable {
		t.Errorf("expected code %v, got %v", codes.Unavailable, st.Code())
	}
}

func TestGetDisposition_MASNotFound(t *testing.T) {
	// Set up with nil MAS response (404)
	cleanup, _, _ := setupTestEnv(t, nil, nil)
	defer cleanup()

	server := newEnforcementServer()

	req := &enforcementv1.GetDispositionRequest{
		Payload: &enforcementv1.GetDispositionPayload{
			MasId:              "non-existent-mas",
			SourceAgentId:      "agent-1",
			DestinationAgentId: "agent-2",
			TraceId:            "trace-123",
		},
	}

	_, err := server.GetDisposition(context.Background(), req)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	st, ok := status.FromError(err)
	if !ok {
		t.Fatalf("expected gRPC status error, got %v", err)
	}

	if st.Code() != codes.NotFound {
		t.Errorf("expected code %v, got %v", codes.NotFound, st.Code())
	}
}

func TestGetDisposition_NoCASACEAssociated(t *testing.T) {
	// MAS with no CEs
	masResp := map[string]any{
		"id":                "mas-123",
		"workspace_id":      "ws-test-123",
		"name":              "Test MAS",
		"cognition_engines": []map[string]any{}, // No CEs
	}

	cleanup, _, _ := setupTestEnv(t, masResp, nil)
	defer cleanup()

	server := newEnforcementServer()

	req := &enforcementv1.GetDispositionRequest{
		Payload: &enforcementv1.GetDispositionPayload{
			MasId:              "mas-123",
			SourceAgentId:      "agent-1",
			DestinationAgentId: "agent-2",
			TraceId:            "trace-123",
		},
	}

	_, err := server.GetDisposition(context.Background(), req)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	st, ok := status.FromError(err)
	if !ok {
		t.Fatalf("expected gRPC status error, got %v", err)
	}

	if st.Code() != codes.NotFound {
		t.Errorf("expected code %v, got %v", codes.NotFound, st.Code())
	}
}

func TestGetDisposition_CASACEDisabled(t *testing.T) {
	// MAS with disabled CASA CE
	masResp := map[string]any{
		"id":           "mas-123",
		"workspace_id": "ws-test-123",
		"name":         "Test MAS",
		"cognition_engines": []map[string]any{
			{
				"ce_id":    "ce-casa-1",
				"ce_type":  "CASA",
				"base_url": "http://localhost:8000",
				"endpoint": "/authorize",
				"enabled":  false, // Disabled
				"status":   "offline",
			},
		},
	}

	cleanup, _, _ := setupTestEnv(t, masResp, nil)
	defer cleanup()

	server := newEnforcementServer()

	req := &enforcementv1.GetDispositionRequest{
		Payload: &enforcementv1.GetDispositionPayload{
			MasId:              "mas-123",
			SourceAgentId:      "agent-1",
			DestinationAgentId: "agent-2",
			TraceId:            "trace-123",
		},
	}

	_, err := server.GetDisposition(context.Background(), req)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	st, ok := status.FromError(err)
	if !ok {
		t.Fatalf("expected gRPC status error, got %v", err)
	}

	if st.Code() != codes.Unavailable {
		t.Errorf("expected code %v, got %v", codes.Unavailable, st.Code())
	}
}

func TestGetDisposition_Success_Allow(t *testing.T) {
	masResp := map[string]any{
		"id":           "mas-123",
		"workspace_id": "ws-test-123",
		"name":         "Test MAS",
		"cognition_engines": []map[string]any{
			{
				"ce_id":    "ce-casa-1",
				"ce_type":  "CASA",
				"base_url": "will-be-replaced",
				"endpoint": "/authorize",
				"enabled":  true,
				"status":   "online",
			},
		},
	}
	casaResp := map[string]any{"action": "allow"}

	cleanup, _, _ := setupTestEnv(t, masResp, casaResp)
	defer cleanup()

	server := newEnforcementServer()

	req := &enforcementv1.GetDispositionRequest{
		Payload: &enforcementv1.GetDispositionPayload{
			MasId:              "mas-123",
			SourceAgentId:      "agent-1",
			DestinationAgentId: "agent-2",
			TraceId:            "trace-123",
		},
	}

	resp, err := server.GetDisposition(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.Action != enforcementv1.GetDispositionResponse_ACTION_ALLOW {
		t.Errorf("expected ACTION_ALLOW, got %v", resp.Action)
	}
}

func TestGetDisposition_Success_Block(t *testing.T) {
	masResp := map[string]any{
		"id":           "mas-123",
		"workspace_id": "ws-test-123",
		"name":         "Test MAS",
		"cognition_engines": []map[string]any{
			{
				"ce_id":    "ce-casa-1",
				"ce_type":  "CASA",
				"base_url": "will-be-replaced",
				"endpoint": "/authorize",
				"enabled":  true,
				"status":   "online",
			},
		},
	}
	casaResp := map[string]any{"action": "block"}

	cleanup, _, _ := setupTestEnv(t, masResp, casaResp)
	defer cleanup()

	server := newEnforcementServer()

	req := &enforcementv1.GetDispositionRequest{
		Payload: &enforcementv1.GetDispositionPayload{
			MasId:              "mas-123",
			SourceAgentId:      "agent-1",
			DestinationAgentId: "agent-2",
			TraceId:            "trace-123",
		},
	}

	resp, err := server.GetDisposition(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.Action != enforcementv1.GetDispositionResponse_ACTION_BLOCK {
		t.Errorf("expected ACTION_BLOCK, got %v", resp.Action)
	}
}

func TestGetDisposition_Success_Modify(t *testing.T) {
	masResp := map[string]any{
		"id":           "mas-123",
		"workspace_id": "ws-test-123",
		"name":         "Test MAS",
		"cognition_engines": []map[string]any{
			{
				"ce_id":    "ce-casa-1",
				"ce_type":  "CASA",
				"base_url": "will-be-replaced",
				"endpoint": "/authorize",
				"enabled":  true,
				"status":   "online",
			},
		},
	}
	casaResp := map[string]any{"action": "modify", "modify": true}

	cleanup, _, _ := setupTestEnv(t, masResp, casaResp)
	defer cleanup()

	server := newEnforcementServer()

	req := &enforcementv1.GetDispositionRequest{
		Payload: &enforcementv1.GetDispositionPayload{
			MasId:              "mas-123",
			SourceAgentId:      "agent-1",
			DestinationAgentId: "agent-2",
			TraceId:            "trace-123",
		},
	}

	resp, err := server.GetDisposition(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.Action != enforcementv1.GetDispositionResponse_ACTION_MODIFY {
		t.Errorf("expected ACTION_MODIFY, got %v", resp.Action)
	}

	if !resp.Modify {
		t.Error("expected Modify to be true")
	}
}

func TestGetDisposition_InvalidCASAAction(t *testing.T) {
	masResp := map[string]any{
		"id":           "mas-123",
		"workspace_id": "ws-test-123",
		"name":         "Test MAS",
		"cognition_engines": []map[string]any{
			{
				"ce_id":    "ce-casa-1",
				"ce_type":  "CASA",
				"base_url": "will-be-replaced",
				"endpoint": "/authorize",
				"enabled":  true,
				"status":   "online",
			},
		},
	}
	casaResp := map[string]any{"action": "invalid_action"}

	cleanup, _, _ := setupTestEnv(t, masResp, casaResp)
	defer cleanup()

	server := newEnforcementServer()

	req := &enforcementv1.GetDispositionRequest{
		Payload: &enforcementv1.GetDispositionPayload{
			MasId:              "mas-123",
			SourceAgentId:      "agent-1",
			DestinationAgentId: "agent-2",
			TraceId:            "trace-123",
		},
	}

	_, err := server.GetDisposition(context.Background(), req)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	st, ok := status.FromError(err)
	if !ok {
		t.Fatalf("expected gRPC status error, got %v", err)
	}

	if st.Code() != codes.Internal {
		t.Errorf("expected code %v, got %v", codes.Internal, st.Code())
	}
}

func TestMapCASAActionToProto(t *testing.T) {
	tests := []struct {
		input    string
		expected enforcementv1.GetDispositionResponse_Action
		wantErr  bool
	}{
		{"allow", enforcementv1.GetDispositionResponse_ACTION_ALLOW, false},
		{"ALLOW", enforcementv1.GetDispositionResponse_ACTION_ALLOW, false},
		{"Allow", enforcementv1.GetDispositionResponse_ACTION_ALLOW, false},
		{"block", enforcementv1.GetDispositionResponse_ACTION_BLOCK, false},
		{"BLOCK", enforcementv1.GetDispositionResponse_ACTION_BLOCK, false},
		{"modify", enforcementv1.GetDispositionResponse_ACTION_MODIFY, false},
		{"MODIFY", enforcementv1.GetDispositionResponse_ACTION_MODIFY, false},
		{"inject", enforcementv1.GetDispositionResponse_ACTION_INJECT, false},
		{"INJECT", enforcementv1.GetDispositionResponse_ACTION_INJECT, false},
		{"unknown", enforcementv1.GetDispositionResponse_ACTION_UNSPECIFIED, true},
		{"", enforcementv1.GetDispositionResponse_ACTION_UNSPECIFIED, true},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result, err := mapCASAActionToProto(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("mapCASAActionToProto(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
				return
			}
			if result != tt.expected {
				t.Errorf("mapCASAActionToProto(%q) = %v, want %v", tt.input, result, tt.expected)
			}
		})
	}
}

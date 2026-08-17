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

func TestEnforce_MissingMASID(t *testing.T) {
	server := newEnforcementServer()

	req := &enforcementv1.EnforceRequest{
		MasId:              "",
		SourceAgentId:      "agent-1",
		DestinationAgentId: "agent-2",
		TraceId:            "trace-123",
	}

	_, err := server.Enforce(context.Background(), req)
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

func TestEnforce_ConfigNotLoaded(t *testing.T) {
	// Ensure config is nil
	cfnConfigMutex.Lock()
	oldConfig := ParsedConfig
	ParsedConfig = nil
	cfnConfigMutex.Unlock()

	defer func() {
		cfnConfigMutex.Lock()
		ParsedConfig = oldConfig
		cfnConfigMutex.Unlock()
	}()

	server := newEnforcementServer()

	req := &enforcementv1.EnforceRequest{
		MasId:              "mas-123",
		SourceAgentId:      "agent-1",
		DestinationAgentId: "agent-2",
		TraceId:            "trace-123",
	}

	_, err := server.Enforce(context.Background(), req)
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

	if st.Message() != "CFN config not loaded" {
		t.Errorf("expected message 'CFN config not loaded', got '%s'", st.Message())
	}
}

func TestEnforce_MASNotFound(t *testing.T) {
	// Set up config with no MAS
	cfnConfigMutex.Lock()
	oldConfig := ParsedConfig
	ParsedConfig = &CfnConfigPayload{
		Workspaces: []WorkspaceCfg{},
	}
	cfnConfigMutex.Unlock()

	defer func() {
		cfnConfigMutex.Lock()
		ParsedConfig = oldConfig
		cfnConfigMutex.Unlock()
	}()

	server := newEnforcementServer()

	req := &enforcementv1.EnforceRequest{
		MasId:              "non-existent-mas",
		SourceAgentId:      "agent-1",
		DestinationAgentId: "agent-2",
		TraceId:            "trace-123",
	}

	_, err := server.Enforce(context.Background(), req)
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

func TestEnforce_NoCASACEAssociated(t *testing.T) {
	// Set up config with MAS but no CASA CE
	cfnConfigMutex.Lock()
	oldConfig := ParsedConfig
	ParsedConfig = &CfnConfigPayload{
		Workspaces: []WorkspaceCfg{
			{
				WorkspaceID:   "ws-1",
				WorkspaceName: "Test Workspace",
				MASList: []MASCfg{
					{
						ID:               "mas-123",
						Name:             "Test MAS",
						CognitionEngines: []MASEngineCfg{}, // No CEs
					},
				},
			},
		},
	}
	cfnConfigMutex.Unlock()

	defer func() {
		cfnConfigMutex.Lock()
		ParsedConfig = oldConfig
		cfnConfigMutex.Unlock()
	}()

	server := newEnforcementServer()

	req := &enforcementv1.EnforceRequest{
		MasId:              "mas-123",
		SourceAgentId:      "agent-1",
		DestinationAgentId: "agent-2",
		TraceId:            "trace-123",
	}

	_, err := server.Enforce(context.Background(), req)
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

func TestEnforce_CASACEDisabled(t *testing.T) {
	// Set up config with MAS and disabled CASA CE
	cfnConfigMutex.Lock()
	oldConfig := ParsedConfig
	ParsedConfig = &CfnConfigPayload{
		CognitionEngines: []EngineCfg{
			{
				ID:       "ce-casa-1",
				CEType:   "CASA",
				BaseURL:  "http://localhost:8000",
				Endpoint: "/authorize",
				Enabled:  false, // Disabled
			},
		},
		Workspaces: []WorkspaceCfg{
			{
				WorkspaceID:   "ws-1",
				WorkspaceName: "Test Workspace",
				MASList: []MASCfg{
					{
						ID:   "mas-123",
						Name: "Test MAS",
						CognitionEngines: []MASEngineCfg{
							{
								ID:     "ce-casa-1",
								CEType: "CASA",
							},
						},
					},
				},
			},
		},
	}
	cfnConfigMutex.Unlock()

	defer func() {
		cfnConfigMutex.Lock()
		ParsedConfig = oldConfig
		cfnConfigMutex.Unlock()
	}()

	server := newEnforcementServer()

	req := &enforcementv1.EnforceRequest{
		MasId:              "mas-123",
		SourceAgentId:      "agent-1",
		DestinationAgentId: "agent-2",
		TraceId:            "trace-123",
	}

	_, err := server.Enforce(context.Background(), req)
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

func TestEnforce_Success_Allow(t *testing.T) {
	// Start mock CASA CE server
	mockCASA := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("expected POST, got %s", r.Method)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"action": "allow"})
	}))
	defer mockCASA.Close()

	// Set up config with MAS and enabled CASA CE pointing to mock
	cfnConfigMutex.Lock()
	oldConfig := ParsedConfig
	ParsedConfig = &CfnConfigPayload{
		CognitionEngines: []EngineCfg{
			{
				ID:       "ce-casa-1",
				CEType:   "CASA",
				BaseURL:  mockCASA.URL,
				Endpoint: "/authorize",
				Enabled:  true,
			},
		},
		Workspaces: []WorkspaceCfg{
			{
				WorkspaceID:   "ws-1",
				WorkspaceName: "Test Workspace",
				MASList: []MASCfg{
					{
						ID:   "mas-123",
						Name: "Test MAS",
						CognitionEngines: []MASEngineCfg{
							{
								ID:     "ce-casa-1",
								CEType: "CASA",
							},
						},
					},
				},
			},
		},
	}
	cfnConfigMutex.Unlock()

	defer func() {
		cfnConfigMutex.Lock()
		ParsedConfig = oldConfig
		cfnConfigMutex.Unlock()
	}()

	server := newEnforcementServer()

	req := &enforcementv1.EnforceRequest{
		MasId:              "mas-123",
		SourceAgentId:      "agent-1",
		DestinationAgentId: "agent-2",
		TraceId:            "trace-123",
	}

	resp, err := server.Enforce(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.Action != enforcementv1.EnforceResponse_ACTION_ALLOW {
		t.Errorf("expected ACTION_ALLOW, got %v", resp.Action)
	}
}

func TestEnforce_Success_Block(t *testing.T) {
	// Start mock CASA CE server
	mockCASA := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"action": "block"})
	}))
	defer mockCASA.Close()

	cfnConfigMutex.Lock()
	oldConfig := ParsedConfig
	ParsedConfig = &CfnConfigPayload{
		CognitionEngines: []EngineCfg{
			{
				ID:       "ce-casa-1",
				CEType:   "CASA",
				BaseURL:  mockCASA.URL,
				Endpoint: "/authorize",
				Enabled:  true,
			},
		},
		Workspaces: []WorkspaceCfg{
			{
				WorkspaceID:   "ws-1",
				WorkspaceName: "Test Workspace",
				MASList: []MASCfg{
					{
						ID:   "mas-123",
						Name: "Test MAS",
						CognitionEngines: []MASEngineCfg{
							{
								ID:     "ce-casa-1",
								CEType: "CASA",
							},
						},
					},
				},
			},
		},
	}
	cfnConfigMutex.Unlock()

	defer func() {
		cfnConfigMutex.Lock()
		ParsedConfig = oldConfig
		cfnConfigMutex.Unlock()
	}()

	server := newEnforcementServer()

	req := &enforcementv1.EnforceRequest{
		MasId:              "mas-123",
		SourceAgentId:      "agent-1",
		DestinationAgentId: "agent-2",
		TraceId:            "trace-123",
	}

	resp, err := server.Enforce(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.Action != enforcementv1.EnforceResponse_ACTION_BLOCK {
		t.Errorf("expected ACTION_BLOCK, got %v", resp.Action)
	}
}

func TestEnforce_Success_Modify(t *testing.T) {
	// Start mock CASA CE server
	mockCASA := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"action": "modify"})
	}))
	defer mockCASA.Close()

	cfnConfigMutex.Lock()
	oldConfig := ParsedConfig
	ParsedConfig = &CfnConfigPayload{
		CognitionEngines: []EngineCfg{
			{
				ID:       "ce-casa-1",
				CEType:   "CASA",
				BaseURL:  mockCASA.URL,
				Endpoint: "/authorize",
				Enabled:  true,
			},
		},
		Workspaces: []WorkspaceCfg{
			{
				WorkspaceID:   "ws-1",
				WorkspaceName: "Test Workspace",
				MASList: []MASCfg{
					{
						ID:   "mas-123",
						Name: "Test MAS",
						CognitionEngines: []MASEngineCfg{
							{
								ID:     "ce-casa-1",
								CEType: "CASA",
							},
						},
					},
				},
			},
		},
	}
	cfnConfigMutex.Unlock()

	defer func() {
		cfnConfigMutex.Lock()
		ParsedConfig = oldConfig
		cfnConfigMutex.Unlock()
	}()

	server := newEnforcementServer()

	req := &enforcementv1.EnforceRequest{
		MasId:              "mas-123",
		SourceAgentId:      "agent-1",
		DestinationAgentId: "agent-2",
		TraceId:            "trace-123",
	}

	resp, err := server.Enforce(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.Action != enforcementv1.EnforceResponse_ACTION_MODIFY {
		t.Errorf("expected ACTION_MODIFY, got %v", resp.Action)
	}
}

func TestEnforce_CASACEError(t *testing.T) {
	// Start mock CASA CE server that returns error
	mockCASA := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("internal error"))
	}))
	defer mockCASA.Close()

	cfnConfigMutex.Lock()
	oldConfig := ParsedConfig
	ParsedConfig = &CfnConfigPayload{
		CognitionEngines: []EngineCfg{
			{
				ID:       "ce-casa-1",
				CEType:   "CASA",
				BaseURL:  mockCASA.URL,
				Endpoint: "/authorize",
				Enabled:  true,
			},
		},
		Workspaces: []WorkspaceCfg{
			{
				WorkspaceID:   "ws-1",
				WorkspaceName: "Test Workspace",
				MASList: []MASCfg{
					{
						ID:   "mas-123",
						Name: "Test MAS",
						CognitionEngines: []MASEngineCfg{
							{
								ID:     "ce-casa-1",
								CEType: "CASA",
							},
						},
					},
				},
			},
		},
	}
	cfnConfigMutex.Unlock()

	defer func() {
		cfnConfigMutex.Lock()
		ParsedConfig = oldConfig
		cfnConfigMutex.Unlock()
	}()

	server := newEnforcementServer()

	req := &enforcementv1.EnforceRequest{
		MasId:              "mas-123",
		SourceAgentId:      "agent-1",
		DestinationAgentId: "agent-2",
		TraceId:            "trace-123",
	}

	_, err := server.Enforce(context.Background(), req)
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

func TestEnforce_InvalidCASAAction(t *testing.T) {
	// Start mock CASA CE server that returns invalid action
	mockCASA := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"action": "invalid_action"})
	}))
	defer mockCASA.Close()

	cfnConfigMutex.Lock()
	oldConfig := ParsedConfig
	ParsedConfig = &CfnConfigPayload{
		CognitionEngines: []EngineCfg{
			{
				ID:       "ce-casa-1",
				CEType:   "CASA",
				BaseURL:  mockCASA.URL,
				Endpoint: "/authorize",
				Enabled:  true,
			},
		},
		Workspaces: []WorkspaceCfg{
			{
				WorkspaceID:   "ws-1",
				WorkspaceName: "Test Workspace",
				MASList: []MASCfg{
					{
						ID:   "mas-123",
						Name: "Test MAS",
						CognitionEngines: []MASEngineCfg{
							{
								ID:     "ce-casa-1",
								CEType: "CASA",
							},
						},
					},
				},
			},
		},
	}
	cfnConfigMutex.Unlock()

	defer func() {
		cfnConfigMutex.Lock()
		ParsedConfig = oldConfig
		cfnConfigMutex.Unlock()
	}()

	server := newEnforcementServer()

	req := &enforcementv1.EnforceRequest{
		MasId:              "mas-123",
		SourceAgentId:      "agent-1",
		DestinationAgentId: "agent-2",
		TraceId:            "trace-123",
	}

	_, err := server.Enforce(context.Background(), req)
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

func TestEnforce_WithExtraMetadata(t *testing.T) {
	var receivedExtra map[string]any

	// Start mock CASA CE server that captures the request
	mockCASA := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var reqBody struct {
			Extra   map[string]any `json:"extra"`
			Payload struct {
				MASID              string `json:"mas_id"`
				SourceAgentID      string `json:"source_agent_id"`
				DestinationAgentID string `json:"destination_agent_id"`
				TraceID            string `json:"trace_id"`
			} `json:"payload"`
		}
		json.NewDecoder(r.Body).Decode(&reqBody)
		receivedExtra = reqBody.Extra

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"action": "allow"})
	}))
	defer mockCASA.Close()

	cfnConfigMutex.Lock()
	oldConfig := ParsedConfig
	ParsedConfig = &CfnConfigPayload{
		CognitionEngines: []EngineCfg{
			{
				ID:       "ce-casa-1",
				CEType:   "CASA",
				BaseURL:  mockCASA.URL,
				Endpoint: "/authorize",
				Enabled:  true,
			},
		},
		Workspaces: []WorkspaceCfg{
			{
				WorkspaceID:   "ws-1",
				WorkspaceName: "Test Workspace",
				MASList: []MASCfg{
					{
						ID:   "mas-123",
						Name: "Test MAS",
						CognitionEngines: []MASEngineCfg{
							{
								ID:     "ce-casa-1",
								CEType: "CASA",
							},
						},
					},
				},
			},
		},
	}
	cfnConfigMutex.Unlock()

	defer func() {
		cfnConfigMutex.Lock()
		ParsedConfig = oldConfig
		cfnConfigMutex.Unlock()
	}()

	server := newEnforcementServer()

	req := &enforcementv1.EnforceRequest{
		MasId:              "mas-123",
		SourceAgentId:      "agent-1",
		DestinationAgentId: "agent-2",
		TraceId:            "trace-123",
		Extra: map[string]string{
			"header-1": "value-1",
			"header-2": "value-2",
		},
	}

	resp, err := server.Enforce(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.Action != enforcementv1.EnforceResponse_ACTION_ALLOW {
		t.Errorf("expected ACTION_ALLOW, got %v", resp.Action)
	}

	// Verify extra was forwarded
	if receivedExtra == nil {
		t.Fatal("expected extra to be forwarded, got nil")
	}
	if receivedExtra["header-1"] != "value-1" {
		t.Errorf("expected header-1=value-1, got %v", receivedExtra["header-1"])
	}
	if receivedExtra["header-2"] != "value-2" {
		t.Errorf("expected header-2=value-2, got %v", receivedExtra["header-2"])
	}
}

func TestMapCASAActionToProto(t *testing.T) {
	tests := []struct {
		input    string
		expected enforcementv1.EnforceResponse_Action
		wantErr  bool
	}{
		{"allow", enforcementv1.EnforceResponse_ACTION_ALLOW, false},
		{"ALLOW", enforcementv1.EnforceResponse_ACTION_ALLOW, false},
		{"Allow", enforcementv1.EnforceResponse_ACTION_ALLOW, false},
		{"block", enforcementv1.EnforceResponse_ACTION_BLOCK, false},
		{"BLOCK", enforcementv1.EnforceResponse_ACTION_BLOCK, false},
		{"modify", enforcementv1.EnforceResponse_ACTION_MODIFY, false},
		{"MODIFY", enforcementv1.EnforceResponse_ACTION_MODIFY, false},
		{"unknown", enforcementv1.EnforceResponse_ACTION_UNSPECIFIED, true},
		{"", enforcementv1.EnforceResponse_ACTION_UNSPECIFIED, true},
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

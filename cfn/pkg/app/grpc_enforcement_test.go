// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
	enforcementv1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/enforcement/v1"
	"github.com/cisco-eti/ioc-scale-cfn-svc/pkg/audit"
	"github.com/google/uuid"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// mockCASACEServer is a mock gRPC server for CASA CE.
type mockCASACEServer struct {
	cev1.UnimplementedCognitionEngineServer
	evaluateResponse *cev1.EvaluateResponse
	evaluateError    error
}

func (m *mockCASACEServer) Evaluate(ctx context.Context, req *cev1.EvaluateRequest) (*cev1.EvaluateResponse, error) {
	if m.evaluateError != nil {
		return nil, m.evaluateError
	}
	return m.evaluateResponse, nil
}

func (m *mockCASACEServer) GetInfo(ctx context.Context, req *cev1.GetInfoRequest) (*cev1.GetInfoResponse, error) {
	return &cev1.GetInfoResponse{
		CeType:  "CASA",
		Version: "0.1.0",
	}, nil
}

// startMockCASACE starts a mock CASA CE gRPC server and returns the address and cleanup function.
func startMockCASACE(t *testing.T, response *cev1.EvaluateResponse, err error) (addr string, cleanup func()) {
	t.Helper()

	lis, lisErr := net.Listen("tcp", "localhost:0")
	if lisErr != nil {
		t.Fatalf("failed to listen: %v", lisErr)
	}

	server := grpc.NewServer()
	mockServer := &mockCASACEServer{
		evaluateResponse: response,
		evaluateError:    err,
	}
	cev1.RegisterCognitionEngineServer(server, mockServer)

	go func() {
		_ = server.Serve(lis)
	}()

	return lis.Addr().String(), func() {
		server.Stop()
		lis.Close()
	}
}

// setupTestEnv sets up the test environment with mock management plane.
// Returns cleanup function and the mock servers.
func setupTestEnv(t *testing.T, masResponse map[string]any) (cleanup func(), mockMgmt *httptest.Server) {
	t.Helper()

	// Save old values
	oldWorkspaceID := WorkspaceID
	oldMgmtURL := MgmtURL

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
	}

	return cleanup, mockMgmt
}

// setupTestEnvWithCASA sets up test environment with both mock mgmt plane and mock CASA CE.
func setupTestEnvWithCASA(t *testing.T, masResponse map[string]any, casaResponse *cev1.EvaluateResponse, casaErr error) (cleanup func()) {
	t.Helper()

	// Start mock CASA CE gRPC server
	casaAddr, casaCleanup := startMockCASACE(t, casaResponse, casaErr)

	// Inject CASA address into MAS response
	if masResponse != nil {
		if ces, ok := masResponse["cognition_engines"].([]map[string]any); ok && len(ces) > 0 {
			ces[0]["base_url"] = casaAddr
		}
	}

	// Setup management plane mock
	mgmtCleanup, _ := setupTestEnv(t, masResponse)

	return func() {
		mgmtCleanup()
		casaCleanup()
	}
}

func TestGetDisposition_MissingPayload(t *testing.T) {
	server := newEnforcementServer(nil)

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
	server := newEnforcementServer(nil)

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

	server := newEnforcementServer(nil)

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
	cleanup, _ := setupTestEnv(t, nil)
	defer cleanup()

	server := newEnforcementServer(nil)

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

	cleanup, _ := setupTestEnv(t, masResp)
	defer cleanup()

	server := newEnforcementServer(nil)

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
				"base_url": "localhost:50051",
				"endpoint": "ioc.ce.v1.CognitionEngine",
				"enabled":  false, // Disabled
				"status":   "offline",
			},
		},
	}

	cleanup, _ := setupTestEnv(t, masResp)
	defer cleanup()

	server := newEnforcementServer(nil)

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
				"endpoint": "ioc.ce.v1.CognitionEngine",
				"enabled":  true,
				"status":   "online",
			},
		},
	}
	casaResp := &cev1.EvaluateResponse{
		Outcome: cev1.Decision_DECISION_ALLOW,
		Reason:  "All checks passed",
	}

	cleanup := setupTestEnvWithCASA(t, masResp, casaResp, nil)
	defer cleanup()

	server := newEnforcementServer(nil)

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

func TestGetDisposition_Success_Deny(t *testing.T) {
	masResp := map[string]any{
		"id":           "mas-123",
		"workspace_id": "ws-test-123",
		"name":         "Test MAS",
		"cognition_engines": []map[string]any{
			{
				"ce_id":    "ce-casa-1",
				"ce_type":  "CASA",
				"base_url": "will-be-replaced",
				"endpoint": "ioc.ce.v1.CognitionEngine",
				"enabled":  true,
				"status":   "online",
			},
		},
	}
	casaResp := &cev1.EvaluateResponse{
		Outcome:      cev1.Decision_DECISION_DENY,
		DenialReason: cev1.DenialReason_DENIAL_REASON_DEVIATES_FROM_INTENT,
		Reason:       "Tool call deviates from original intent",
	}

	cleanup := setupTestEnvWithCASA(t, masResp, casaResp, nil)
	defer cleanup()

	server := newEnforcementServer(nil)

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
				"endpoint": "ioc.ce.v1.CognitionEngine",
				"enabled":  true,
				"status":   "online",
			},
		},
	}
	casaResp := &cev1.EvaluateResponse{
		Outcome: cev1.Decision_DECISION_MODIFY,
		Reason:  "Modifying tool arguments",
		ModifiedAction: map[string]string{
			"tool_name": "read_file",
			"path":      "/safe/path/file.txt",
		},
	}

	cleanup := setupTestEnvWithCASA(t, masResp, casaResp, nil)
	defer cleanup()

	server := newEnforcementServer(nil)

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

func TestGetDisposition_CASACEError(t *testing.T) {
	masResp := map[string]any{
		"id":           "mas-123",
		"workspace_id": "ws-test-123",
		"name":         "Test MAS",
		"cognition_engines": []map[string]any{
			{
				"ce_id":    "ce-casa-1",
				"ce_type":  "CASA",
				"base_url": "will-be-replaced",
				"endpoint": "ioc.ce.v1.CognitionEngine",
				"enabled":  true,
				"status":   "online",
			},
		},
	}

	// Return an error from CASA CE
	cleanup := setupTestEnvWithCASA(t, masResp, nil, status.Error(codes.Internal, "internal error"))
	defer cleanup()

	server := newEnforcementServer(nil)

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

// slowStore is a database.Store test double whose CreateAuditEvent blocks
// until unblock is closed, then records completion - used to prove Stop()
// (via enforcementServer.Wait()) actually waits for the in-flight audit write
// goroutine instead of racing it.
type slowStore struct {
	unblock   chan struct{}
	completed atomic.Bool
}

func (s *slowStore) Close() error { return nil }
func (s *slowStore) CreateAuditEvent(ctx context.Context, a *audit.Audit) error {
	<-s.unblock
	s.completed.Store(true)
	return nil
}
func (s *slowStore) GetAuditEventByID(ctx context.Context, id uuid.UUID) (*audit.Audit, error) {
	return nil, nil
}
func (s *slowStore) ListAuditEvents(ctx context.Context, resourceType, auditType string, page, pageSize int) (*audit.AuditListResponse, error) {
	return nil, nil
}

func TestEnforcementServer_WaitBlocksForInFlightAuditWrite(t *testing.T) {
	masResp := map[string]any{
		"id":           "mas-123",
		"workspace_id": "ws-test-123",
		"name":         "Test MAS",
		"cognition_engines": []map[string]any{
			{
				"ce_id":    "ce-casa-1",
				"ce_type":  "CASA",
				"base_url": "will-be-replaced",
				"endpoint": "ioc.ce.v1.CognitionEngine",
				"enabled":  true,
				"status":   "online",
			},
		},
	}
	cleanup := setupTestEnvWithCASA(t, masResp, &cev1.EvaluateResponse{Outcome: cev1.Decision_DECISION_ALLOW}, nil)
	defer cleanup()

	store := &slowStore{unblock: make(chan struct{})}
	server := newEnforcementServer(store)

	req := &enforcementv1.GetDispositionRequest{
		Payload: &enforcementv1.GetDispositionPayload{
			MasId:              "mas-123",
			SourceAgentId:      "agent-1",
			DestinationAgentId: "agent-2",
			TraceId:            "trace-123",
		},
	}

	if _, err := server.GetDisposition(context.Background(), req); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	waitDone := make(chan struct{})
	waitResult := make(chan bool, 1)
	go func() {
		waitResult <- server.WaitTimeout(2 * time.Second)
		close(waitDone)
	}()

	select {
	case <-waitDone:
		t.Fatal("WaitTimeout() returned before the in-flight audit write completed")
	case <-time.After(100 * time.Millisecond):
	}

	if store.completed.Load() {
		t.Fatal("test setup issue: audit write completed before it should have")
	}

	close(store.unblock)

	select {
	case <-waitDone:
	case <-time.After(2 * time.Second):
		t.Fatal("WaitTimeout() did not return after the audit write completed")
	}

	if ok := <-waitResult; !ok {
		t.Error("WaitTimeout() returned false (timed out) even though the write completed in time")
	}

	if !store.completed.Load() {
		t.Error("Wait() returned before CreateAuditEvent finished")
	}
}

func TestEnforcementServer_WaitTimeoutReturnsFalseOnHungWrite(t *testing.T) {
	masResp := map[string]any{
		"id":           "mas-123",
		"workspace_id": "ws-test-123",
		"name":         "Test MAS",
		"cognition_engines": []map[string]any{
			{
				"ce_id":    "ce-casa-1",
				"ce_type":  "CASA",
				"base_url": "will-be-replaced",
				"endpoint": "ioc.ce.v1.CognitionEngine",
				"enabled":  true,
				"status":   "online",
			},
		},
	}
	cleanup := setupTestEnvWithCASA(t, masResp, &cev1.EvaluateResponse{Outcome: cev1.Decision_DECISION_ALLOW}, nil)
	defer cleanup()

	// unblock is never closed, so the audit write hangs "forever" (until the test ends).
	store := &slowStore{unblock: make(chan struct{})}
	server := newEnforcementServer(store)

	req := &enforcementv1.GetDispositionRequest{
		Payload: &enforcementv1.GetDispositionPayload{
			MasId:              "mas-123",
			SourceAgentId:      "agent-1",
			DestinationAgentId: "agent-2",
			TraceId:            "trace-123",
		},
	}
	if _, err := server.GetDisposition(context.Background(), req); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	start := time.Now()
	ok := server.WaitTimeout(50 * time.Millisecond)
	elapsed := time.Since(start)

	if ok {
		t.Error("WaitTimeout() returned true for a write that never completes")
	}
	if elapsed > time.Second {
		t.Errorf("WaitTimeout() took %s to return, want it bounded near the 50ms timeout", elapsed)
	}
}

func TestMapCEDecisionToAction(t *testing.T) {
	tests := []struct {
		input    cev1.Decision
		expected enforcementv1.GetDispositionResponse_Action
	}{
		{cev1.Decision_DECISION_ALLOW, enforcementv1.GetDispositionResponse_ACTION_ALLOW},
		{cev1.Decision_DECISION_DENY, enforcementv1.GetDispositionResponse_ACTION_BLOCK},
		{cev1.Decision_DECISION_MODIFY, enforcementv1.GetDispositionResponse_ACTION_MODIFY},
		{cev1.Decision_DECISION_UNSPECIFIED, enforcementv1.GetDispositionResponse_ACTION_UNSPECIFIED},
	}

	for _, tt := range tests {
		t.Run(tt.input.String(), func(t *testing.T) {
			result := mapCEDecisionToAction(tt.input)
			if result != tt.expected {
				t.Errorf("mapCEDecisionToAction(%v) = %v, want %v", tt.input, result, tt.expected)
			}
		})
	}
}

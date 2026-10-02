// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"time"

	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
	enforcementv1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/enforcement/v1"
	"github.com/cisco-eti/ioc-scale-cfn-svc/pkg/audit"
	"github.com/cisco-eti/ioc-scale-cfn-svc/pkg/client/casa"
	"github.com/cisco-eti/ioc-scale-cfn-svc/pkg/client/database"
	"github.com/cisco-eti/ioc-scale-cfn-svc/pkg/client/mgmt"
	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gorm.io/datatypes"
)

// systemActorID is used as created_by/last_modified_by for audit events CFN
// writes about its own actions, since there is no human actor. It's the same
// all-zero UUID the Mgmt UI already special-cases and renders as "Admin".
var systemActorID = uuid.MustParse("00000000-0000-0000-0000-000000000000")

// enforcementServer implements the EnforcementServer interface.
type enforcementServer struct {
	enforcementv1.UnimplementedEnforcementServer
	db database.Store
	// auditWG tracks in-flight fire-and-forget audit writes so Stop() can wait
	// for them before closing the database connection out from under them.
	auditWG sync.WaitGroup
}

// newEnforcementServer creates a new enforcement gRPC server.
func newEnforcementServer(db database.Store) *enforcementServer {
	return &enforcementServer{db: db}
}

// WaitTimeout blocks until all in-flight audit writes have completed, or the
// given timeout elapses. Returns false on timeout, so a hung/unreachable DB
// during shutdown can't block the process from exiting forever.
func (s *enforcementServer) WaitTimeout(timeout time.Duration) bool {
	done := make(chan struct{})
	go func() {
		s.auditWG.Wait()
		close(done)
	}()

	select {
	case <-done:
		return true
	case <-time.After(timeout):
		return false
	}
}

// GetDisposition handles enforcement requests from the Enforcement Proxy.
// This is a blocking/synchronous call on the live agent conversation path.
func (s *enforcementServer) GetDisposition(ctx context.Context, req *enforcementv1.GetDispositionRequest) (*enforcementv1.GetDispositionResponse, error) {
	log := getLogger()

	// Validate request
	if req.Payload == nil {
		return nil, status.Error(codes.InvalidArgument, "payload is required")
	}
	if req.Payload.MasId == "" {
		return nil, status.Error(codes.InvalidArgument, "mas_id is required")
	}
	if req.Payload.SourceAgentId == "" {
		return nil, status.Error(codes.InvalidArgument, "source_agent_id is required")
	}
	if req.Payload.DestinationAgentId == "" {
		return nil, status.Error(codes.InvalidArgument, "destination_agent_id is required")
	}
	if req.Payload.TraceId == "" {
		return nil, status.Error(codes.InvalidArgument, "trace_id is required")
	}
	if req.Payload.SpanId == "" {
		return nil, status.Error(codes.InvalidArgument, "span_id is required")
	}

	log.Infof("enforcement request: mas_id=%s source=%s dest=%s trace_id=%s span_id=%s",
		req.Payload.MasId, req.Payload.SourceAgentId, req.Payload.DestinationAgentId, req.Payload.TraceId, req.Payload.SpanId)

	// Check workspace_id is available
	if WorkspaceID == "" {
		log.Errorf("enforcement request failed: workspace_id not set")
		return nil, status.Error(codes.Unavailable, "workspace_id not configured")
	}

	// Check management plane URL is available
	if MgmtURL == "" {
		log.Errorf("enforcement request failed: management plane URL not set")
		return nil, status.Error(codes.Unavailable, "management plane URL not configured")
	}

	// Fetch MAS from management plane
	mgmtClient := mgmt.New(MgmtURL, 30*time.Second)
	mas, err := mgmtClient.GetMAS(ctx, WorkspaceID, req.Payload.MasId)
	if err != nil {
		if errors.Is(err, mgmt.ErrNotFound) {
			log.Warnf("enforcement request failed: MAS not found: mas_id=%s", req.Payload.MasId)
			return nil, status.Errorf(codes.NotFound, "MAS not found: %s", req.Payload.MasId)
		}
		log.Errorf("enforcement request failed: failed to fetch MAS: mas_id=%s error=%v", req.Payload.MasId, err)
		return nil, status.Errorf(codes.Internal, "failed to fetch MAS: %v", err)
	}

	log.Debugf("fetched MAS from management plane: mas_id=%s workspace_id=%s mas_name=%s",
		mas.ID, mas.WorkspaceID, mas.Name)

	// Find CASA CEs for this MAS
	casaCEs := mas.FindCASACEs()
	if len(casaCEs) == 0 {
		log.Warnf("enforcement request failed: no CASA CE associated with MAS: mas_id=%s", req.Payload.MasId)
		return nil, status.Errorf(codes.NotFound, "no CASA CE associated with MAS: %s", req.Payload.MasId)
	}

	// Find first online and enabled CASA CE, tracking why others were skipped
	var casaCE *mgmt.MASCognitionEngine
	var disabledCount, offlineCount int
	for _, ce := range casaCEs {
		if !ce.Enabled {
			disabledCount++
			continue
		}
		if ce.Status != "online" {
			offlineCount++
			continue
		}
		casaCE = ce
		break
	}
	if casaCE == nil {
		// Provide specific error based on why no CE was available
		if disabledCount > 0 && offlineCount == 0 {
			log.Warnf("enforcement request failed: all CASA CEs disabled for MAS: mas_id=%s (disabled=%d)", req.Payload.MasId, disabledCount)
			return nil, status.Errorf(codes.Unavailable, "all CASA CEs are disabled for MAS: %s", req.Payload.MasId)
		}
		if offlineCount > 0 && disabledCount == 0 {
			log.Warnf("enforcement request failed: all CASA CEs offline for MAS: mas_id=%s (offline=%d)", req.Payload.MasId, offlineCount)
			return nil, status.Errorf(codes.Unavailable, "all CASA CEs are offline for MAS: %s", req.Payload.MasId)
		}
		log.Warnf("enforcement request failed: no healthy CASA CE for MAS: mas_id=%s (disabled=%d, offline=%d)", req.Payload.MasId, disabledCount, offlineCount)
		return nil, status.Errorf(codes.Unavailable, "no healthy CASA CE available for MAS: %s (disabled=%d, offline=%d)", req.Payload.MasId, disabledCount, offlineCount)
	}

	log.Infof("calling CASA CE: ce_id=%s base_url=%s endpoint=%s", casaCE.CEID, casaCE.BaseURL, casaCE.Endpoint)

	// Create CASA CE gRPC client
	// BaseURL is the gRPC address (e.g., "casa-ce:50051")
	// Endpoint is the gRPC service name (e.g., "ioc.ce.v1.CognitionEngine") - reserved for future use
	casaClient := casa.New(casaCE.BaseURL, casaCE.Endpoint, 30*time.Second)

	// Connect to CASA CE
	if err := casaClient.Connect(ctx); err != nil {
		log.Errorf("failed to connect to CASA CE: ce_id=%s error=%v", casaCE.CEID, err)
		return nil, status.Errorf(codes.Unavailable, "failed to connect to CASA CE: %v", err)
	}
	defer casaClient.Close()

	// Build Evaluate request
	casaReq := &cev1.EvaluateRequest{
		MasId:              req.Payload.MasId,
		SourceAgentId:      req.Payload.SourceAgentId,
		DestinationAgentId: req.Payload.DestinationAgentId,
		TraceId:            req.Payload.TraceId,
		SpanId:             req.Payload.SpanId,
		WorkspaceId:        WorkspaceID,
		Extra:              req.Extra,
	}

	// Call CASA CE Evaluate RPC
	casaResp, err := casaClient.Evaluate(ctx, casaReq)
	if err != nil {
		log.Errorf("CASA CE Evaluate failed: ce_id=%s error=%v", casaCE.CEID, err)
		s.auditCEInvocation(casaCE.CEID, casaReq, "ERROR", err.Error())
		return nil, status.Errorf(codes.Internal, "CASA CE Evaluate failed: %v", err)
	}

	log.Infof("CASA CE response: ce_id=%s outcome=%s reason=%s", casaCE.CEID, casaResp.Outcome, casaResp.Reason)
	s.auditCEInvocation(casaCE.CEID, casaReq, casaResp.Outcome.String(), casaResp.Reason)

	// Map CASA CE decision to enforcement action
	action := mapCEDecisionToAction(casaResp.Outcome)

	// Determine modify flag based on outcome
	modify := casaResp.Outcome == cev1.Decision_DECISION_MODIFY

	return &enforcementv1.GetDispositionResponse{
		Action: action,
		Modify: modify,
	}, nil
}

// auditCEInvocation records CFN's call into a CE. It is fire-and-forget: a
// write failure is logged but never affects the GetDisposition response,
// since this runs on the latency-sensitive live-conversation path.
func (s *enforcementServer) auditCEInvocation(ceID string, req *cev1.EvaluateRequest, outcome, reason string) {
	if s.db == nil {
		return
	}

	infoBytes, err := json.Marshal(map[string]any{
		"mas_id":               req.MasId,
		"source_agent_id":      req.SourceAgentId,
		"destination_agent_id": req.DestinationAgentId,
		"trace_id":             req.TraceId,
		"span_id":              req.SpanId,
		"outcome":              outcome,
		"reason":               reason,
	})
	if err != nil {
		getLogger().Errorf("failed to marshal audit_information for CE invocation: ce_id=%s error=%v", ceID, err)
		return
	}

	success := outcome != "ERROR"

	s.auditWG.Add(1)
	go func() {
		defer s.auditWG.Done()
		event := &audit.Audit{
			ResourceType:            audit.ResourceTypeCognitionEngine,
			ResourceIdentifier:      ceID,
			AuditType:               audit.AuditTypeCEInvoked,
			AuditResourceIdentifier: req.MasId,
			AuditInformation:        datatypes.JSON(infoBytes),
			Success:                 &success,
			CreatedBy:               systemActorID,
			LastModifiedBy:          systemActorID,
		}
		// Not the RPC's ctx: that gets cancelled the moment GetDisposition returns,
		// which would kill this write before it has a chance to run.
		if err := s.db.CreateAuditEvent(context.Background(), event); err != nil {
			getLogger().Errorf("failed to write CE invocation audit event: ce_id=%s mas_id=%s error=%v", ceID, req.MasId, err)
		}
	}()
}

// mapCEDecisionToAction maps CASA CE decision enum to enforcement action enum.
func mapCEDecisionToAction(decision cev1.Decision) enforcementv1.GetDispositionResponse_Action {
	switch decision {
	case cev1.Decision_DECISION_ALLOW:
		return enforcementv1.GetDispositionResponse_ACTION_ALLOW
	case cev1.Decision_DECISION_DENY:
		return enforcementv1.GetDispositionResponse_ACTION_BLOCK
	case cev1.Decision_DECISION_MODIFY:
		return enforcementv1.GetDispositionResponse_ACTION_MODIFY
	default:
		return enforcementv1.GetDispositionResponse_ACTION_UNSPECIFIED
	}
}

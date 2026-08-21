// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"context"
	"fmt"
	"strings"
	"time"

	enforcementv1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/enforcement/v1"
	"github.com/cisco-eti/ioc-scale-cfn-svc/pkg/client/casa"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// enforcementServer implements the EnforcementServer interface.
type enforcementServer struct {
	enforcementv1.UnimplementedEnforcementServer
}

// newEnforcementServer creates a new enforcement gRPC server.
func newEnforcementServer() *enforcementServer {
	return &enforcementServer{}
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

	log.Infof("enforcement request: mas_id=%s source=%s dest=%s trace_id=%s",
		req.Payload.MasId, req.Payload.SourceAgentId, req.Payload.DestinationAgentId, req.Payload.TraceId)

	// Get config (thread-safe read)
	cfnConfigMutex.RLock()
	config := ParsedConfig
	cfnConfigMutex.RUnlock()

	if config == nil {
		log.Errorf("enforcement request failed: config not loaded")
		return nil, status.Error(codes.Unavailable, "CFN config not loaded")
	}

	// Find MAS by ID (resolves workspace_id internally)
	mas, workspaceID := config.FindMASByID(req.Payload.MasId)
	if mas == nil {
		log.Warnf("enforcement request failed: MAS not found: mas_id=%s", req.Payload.MasId)
		return nil, status.Errorf(codes.NotFound, "MAS not found: %s", req.Payload.MasId)
	}

	log.Debugf("resolved MAS: mas_id=%s workspace_id=%s mas_name=%s", req.Payload.MasId, workspaceID, mas.Name)

	// Find CASA CE for this MAS
	casaCE := config.FindCASACEForMAS(mas)
	if casaCE == nil {
		log.Warnf("enforcement request failed: no CASA CE associated with MAS: mas_id=%s", req.Payload.MasId)
		return nil, status.Errorf(codes.NotFound, "no CASA CE associated with MAS: %s", req.Payload.MasId)
	}

	if !casaCE.Enabled {
		log.Warnf("enforcement request failed: CASA CE is disabled: ce_id=%s", casaCE.ID)
		return nil, status.Errorf(codes.Unavailable, "CASA CE is disabled: %s", casaCE.ID)
	}

	log.Infof("calling CASA CE: ce_id=%s base_url=%s endpoint=%s", casaCE.ID, casaCE.BaseURL, casaCE.Endpoint)

	// Create CASA CE client and call authorize
	casaClient := casa.New(casaCE.BaseURL, casaCE.Endpoint, 30*time.Second)

	// Convert map[string]string to map[string]any for CASA client
	var extra map[string]any
	if req.Extra != nil {
		extra = make(map[string]any, len(req.Extra))
		for k, v := range req.Extra {
			extra[k] = v
		}
	}

	casaReq := &casa.AuthorizeRequest{
		Extra: extra,
		Payload: casa.AuthorizePayload{
			MASID:              req.Payload.MasId,
			SourceAgentID:      req.Payload.SourceAgentId,
			DestinationAgentID: req.Payload.DestinationAgentId,
			TraceID:            req.Payload.TraceId,
		},
	}

	casaResp, err := casaClient.Authorize(ctx, casaReq)
	if err != nil {
		log.Errorf("CASA CE call failed: ce_id=%s error=%v", casaCE.ID, err)
		return nil, status.Errorf(codes.Internal, "CASA CE call failed: %v", err)
	}

	log.Infof("CASA CE response: ce_id=%s action=%s", casaCE.ID, casaResp.Action)

	// Map CASA response to gRPC response
	action, err := mapCASAActionToProto(casaResp.Action)
	if err != nil {
		log.Errorf("invalid CASA CE action: ce_id=%s action=%s error=%v", casaCE.ID, casaResp.Action, err)
		return nil, status.Errorf(codes.Internal, "invalid CASA CE action: %s", casaResp.Action)
	}

	// Get modify flag from CASA response (defaults to false if not set)
	modify := false
	if casaResp.Modify != nil {
		modify = *casaResp.Modify
	}

	return &enforcementv1.GetDispositionResponse{
		Action: action,
		Modify: modify,
	}, nil
}

// mapCASAActionToProto maps CASA CE action string to proto enum.
func mapCASAActionToProto(action string) (enforcementv1.GetDispositionResponse_Action, error) {
	switch strings.ToLower(action) {
	case "allow":
		return enforcementv1.GetDispositionResponse_ACTION_ALLOW, nil
	case "block":
		return enforcementv1.GetDispositionResponse_ACTION_BLOCK, nil
	case "modify":
		return enforcementv1.GetDispositionResponse_ACTION_MODIFY, nil
	case "inject":
		return enforcementv1.GetDispositionResponse_ACTION_INJECT, nil
	default:
		return enforcementv1.GetDispositionResponse_ACTION_UNSPECIFIED, fmt.Errorf("unknown action: %s", action)
	}
}

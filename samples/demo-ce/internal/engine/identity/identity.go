// Package identity is the identity layer of one MAS: its policy decides the route, then the Cognition Store
// findings are read and written. Content is judged by the evidence judges, above this layer.
package identity

import (
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/ids"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/oxp"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/pkg/policy"

	"context"
	"log"
	"time"

	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Engine is the identity layer of one MAS.
type Engine struct {
	cev1.UnimplementedCognitionEngineServer
	Policy policy.Policy
	// MasID is the MAS this engine serves; it may fail until the MAS is known.
	MasID func() (string, error)
	// Store is the Cognition Store; nil means findings are neither read nor written.
	Store *oxp.Store
	// CEType and CEVersion are what GetInfo reports; empty means CASA and reference-v1.
	CEType, CEVersion string
}

func (s *Engine) Evaluate(ctx context.Context, r *cev1.EvaluateRequest) (*cev1.EvaluateResponse, error) {
	ctx, cancel := context.WithTimeout(ctx, 1500*time.Millisecond)
	defer cancel()
	if r == nil || !ids.Valid(r.TraceId, 32) || !ids.Valid(r.SpanId, 16) || r.MasId == "" || r.SourceAgentId == "" || r.DestinationAgentId == "" {
		return nil, status.Error(codes.InvalidArgument, "valid trace/span pair and MAS/source/destination identities required")
	}
	mas, err := s.MasID()
	if err != nil || mas == "" {
		return nil, status.Error(codes.Unavailable, "configured MAS identity unavailable")
	}
	selected := s.Policy.Decide(r.SourceAgentId, r.DestinationAgentId)
	if r.MasId != mas {
		selected = policy.Rule{ID: "MAS_SCOPE", Effect: "DENY", Reason: "MAS is outside this CE's configured scope"}
	}
	out := &cev1.EvaluateResponse{TraceId: r.TraceId, Timestamp: time.Now().UTC().Format(time.RFC3339Nano), Outcome: cev1.Decision_DECISION_ALLOW, Reason: selected.Reason, ContextSufficiency: cev1.ContextSufficiency_CONTEXT_SUFFICIENCY_DEGRADED_ATOMIC, ChecksRun: []*cev1.CheckResult{{CheckId: selected.ID, Passed: selected.Effect == "ALLOW", Reason: selected.Reason}}}
	if selected.Effect == "DENY" {
		out.Outcome = cev1.Decision_DECISION_DENY
		out.DenialReason = cev1.DenialReason_DENIAL_REASON_DEVIATES_FROM_INTENT
	}
	// Findings are historical context, not the held message. This profile always
	// reports atomic context and never infers native session.id from trace_id.
	// A scoped CE must not read or write another MAS's findings. Out-of-scope
	// denial is logged here and by CF, without touching that MAS's Store scope.
	if s.Store != nil && r.MasId == mas {
		if err := s.Store.Read(ctx, r); err != nil {
			if ctx.Err() != nil {
				return nil, status.FromContextError(ctx.Err()).Err()
			}
			log.Printf("Cognition Store read failed: %v", err)
			return nil, status.Error(codes.Unavailable, "Cognition Store read failed")
		}
		if err := s.Store.Write(ctx, r, out, selected.ID); err != nil {
			if ctx.Err() != nil {
				return nil, status.FromContextError(ctx.Err()).Err()
			}
			log.Printf("Cognition Store write failed: %v", err)
			return nil, status.Error(codes.Unavailable, "Cognition Store write failed")
		}
	}
	if err := ctx.Err(); err != nil {
		return nil, status.FromContextError(err).Err()
	}
	log.Printf("decision trace=%s span=%s source=%s destination=%s outcome=%s rule=%s layer=identity", r.TraceId, r.SpanId, r.SourceAgentId, r.DestinationAgentId, out.Outcome, selected.ID)
	return out, nil
}
func (s *Engine) GetInfo(context.Context, *cev1.GetInfoRequest) (*cev1.GetInfoResponse, error) {
	ids := []string{"MAS_SCOPE", "DEFAULT_DENY"}
	for _, r := range s.Policy.Rules {
		ids = append(ids, r.ID)
	}
	return &cev1.GetInfoResponse{CeType: orDefault(s.CEType, "CASA"), Version: orDefault(s.CEVersion, "reference-v1"), EnabledChecks: ids, MatcherStrategy: "exact-identity-policy; content-not-evaluated"}, nil
}

func orDefault(v, fallback string) string {
	if v == "" {
		return fallback
	}
	return v
}

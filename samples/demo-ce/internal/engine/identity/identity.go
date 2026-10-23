// Package identity decides the route and MAS scope. The outer engine owns
// Cognition Store I/O and content evaluation before persisting a final decision.
package identity

import (
	"context"
	"time"

	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/ids"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/logging"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/pkg/config"
	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Engine is the identity layer of one MAS.
type Engine struct {
	cev1.UnimplementedCognitionEngineServer
	Config config.Config
	// MasID is the MAS this engine serves; it may fail until the MAS is known.
	MasID func() (string, error)
	// CEType and CEVersion are what GetInfo reports; empty means CASA and reference-v1.
	CEType, CEVersion string
}

func (s *Engine) Evaluate(ctx context.Context, r *cev1.EvaluateRequest) (*cev1.EvaluateResponse, error) {
	out, _, err := s.Decide(ctx, r)
	return out, err
}

// Decide also returns whether the request belongs to this MAS. Store access must
// use that resolved scope, without rereading a potentially changing MAS file.
func (s *Engine) Decide(ctx context.Context, r *cev1.EvaluateRequest) (*cev1.EvaluateResponse, bool, error) {
	if r == nil || !ids.Valid(r.TraceId, 32) || !ids.Valid(r.SpanId, 16) || r.MasId == "" || r.SourceAgentId == "" || r.DestinationAgentId == "" {
		return nil, false, status.Error(codes.InvalidArgument, "valid trace/span pair and MAS/source/destination identities required")
	}
	mas, err := s.MasID()
	if err != nil || mas == "" {
		return nil, false, status.Error(codes.Unavailable, "configured MAS identity unavailable")
	}
	selected := s.Config.Decide(r.SourceAgentId, r.DestinationAgentId)
	if r.MasId != mas {
		selected = config.Rule{ID: "MAS_SCOPE", Effect: "DENY", Reason: "MAS is outside this CE's configured scope"}
	}
	out := &cev1.EvaluateResponse{TraceId: r.TraceId, Timestamp: time.Now().UTC().Format(time.RFC3339Nano), Outcome: cev1.Decision_DECISION_ALLOW, Reason: selected.Reason, ContextSufficiency: cev1.ContextSufficiency_CONTEXT_SUFFICIENCY_DEGRADED_ATOMIC, ChecksRun: []*cev1.CheckResult{{CheckId: selected.ID, Passed: selected.Effect == "ALLOW", Reason: selected.Reason}}}
	if selected.Effect == "DENY" {
		out.Outcome = cev1.Decision_DECISION_DENY
		out.DenialReason = cev1.DenialReason_DENIAL_REASON_DEVIATES_FROM_INTENT
	}
	if err := ctx.Err(); err != nil {
		return nil, false, status.FromContextError(err).Err()
	}
	logging.FromContext(ctx).InfoContext(ctx, "Identity route evaluated", "event", "identity.complete", "stage", "IDENTITY", "outcome", logging.Outcome(out), "check_id", selected.ID, "in_scope", r.MasId == mas)
	return out, r.MasId == mas, nil
}
func (s *Engine) GetInfo(context.Context, *cev1.GetInfoRequest) (*cev1.GetInfoResponse, error) {
	ids := []string{"MAS_SCOPE", "DEFAULT_DENY"}
	for _, r := range s.Config.Rules {
		ids = append(ids, r.ID)
	}
	return &cev1.GetInfoResponse{CeType: orDefault(s.CEType, "CASA"), Version: orDefault(s.CEVersion, "reference-v1"), EnabledChecks: ids, MatcherStrategy: "exact-identity-config; content-not-evaluated"}, nil
}

func orDefault(v, fallback string) string {
	if v == "" {
		return fallback
	}
	return v
}

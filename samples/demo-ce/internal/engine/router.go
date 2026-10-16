// Package engine is the CognitionEngine served to CFN: the identity policy of a MAS first, then the content
// of the request, judged from the evidence the policy names (session topology in OXP, or an event published
// before the call and found in the inbox by the exact span).
package engine

import (
	"context"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/engine/identity"
	"log"
	"time"

	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/ids"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/inbox"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/oxp"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/pkg/policy"
	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Options is what a Router needs besides the policy.
type Options struct {
	// MasID resolves the MAS of a single (non per-MAS) policy; it may fail until the MAS is known.
	MasID func() (string, error)
	// OXPURL is the OXP base URL; empty disables tool_input evidence and the Cognition Store.
	OXPURL string
	// Store is the Cognition Store; nil means findings are neither read nor written.
	Store *oxp.Store
	// Inbox receives the pre-call events; evidence from events needs it.
	Inbox *inbox.Inbox
	// Wait bounds the wait for session context.
	Wait time.Duration
	// CEType and CEVersion are reported in GetInfo.
	CEType, CEVersion string
	// ToolPrefix is stripped from a destination to get the Observe tool name (tool_input evidence).
	ToolPrefix string
}

// Router is the CognitionEngine served to CFN. With a single policy it forwards everything to one engine
// (which denies a foreign MAS itself); with per-MAS policies it picks the engine of the request's MAS and
// denies any other MAS without touching its Cognition Store scope.
type Router struct {
	cev1.UnimplementedCognitionEngineServer
	single *contentEngine
	byMAS  map[string]*contentEngine
	order  []string
}

// New builds the router of a decoded policy file.
func New(set policy.Set, o Options) *Router {
	build := func(p policy.Policy, mas func() (string, error)) *contentEngine {
		id := &identity.Engine{Policy: p, MasID: mas, Store: o.Store, CEType: o.CEType, CEVersion: o.CEVersion}
		return newContentEngine(id, contentOptions{OXPURL: o.OXPURL, Wait: o.Wait, Inbox: o.Inbox, ToolPrefix: o.ToolPrefix})
	}
	rt := &Router{}
	if set.Single != nil {
		rt.single = build(*set.Single, o.MasID)
		return rt
	}
	rt.byMAS, rt.order = map[string]*contentEngine{}, set.Order
	for _, id := range set.Order {
		id := id
		rt.byMAS[id] = build(set.ByMAS[id], func() (string, error) { return id, nil })
	}
	return rt
}

func (rt *Router) Evaluate(ctx context.Context, r *cev1.EvaluateRequest) (*cev1.EvaluateResponse, error) {
	if rt.single != nil {
		return rt.single.Evaluate(ctx, r)
	}
	if r == nil || !ids.Valid(r.TraceId, 32) || !ids.Valid(r.SpanId, 16) || r.MasId == "" || r.SourceAgentId == "" || r.DestinationAgentId == "" {
		return nil, status.Error(codes.InvalidArgument, "valid trace/span pair and MAS/source/destination identities required")
	}
	se, ok := rt.byMAS[r.MasId]
	if !ok {
		reason := "MAS is outside this CE's configured scope"
		log.Printf("decision trace=%s span=%s source=%s destination=%s outcome=%s rule=MAS_SCOPE layer=identity", r.TraceId, r.SpanId, r.SourceAgentId, r.DestinationAgentId, cev1.Decision_DECISION_DENY)
		return &cev1.EvaluateResponse{TraceId: r.TraceId, Timestamp: time.Now().UTC().Format(time.RFC3339Nano), Outcome: cev1.Decision_DECISION_DENY, DenialReason: cev1.DenialReason_DENIAL_REASON_DEVIATES_FROM_INTENT, Reason: reason,
			ContextSufficiency: cev1.ContextSufficiency_CONTEXT_SUFFICIENCY_DEGRADED_ATOMIC, ChecksRun: []*cev1.CheckResult{{CheckId: "MAS_SCOPE", Passed: false, Reason: reason}}}, nil
	}
	return se.Evaluate(ctx, r)
}

func (rt *Router) GetInfo(ctx context.Context, r *cev1.GetInfoRequest) (*cev1.GetInfoResponse, error) {
	if rt.single != nil {
		return rt.single.GetInfo(ctx, r)
	}
	var info *cev1.GetInfoResponse
	seen := map[string]bool{}
	for _, id := range rt.order {
		one, err := rt.byMAS[id].GetInfo(ctx, r)
		if err != nil {
			return nil, err
		}
		checks := one.EnabledChecks
		if info == nil {
			info = one
			info.EnabledChecks = nil
		}
		for _, c := range checks {
			if !seen[c] {
				seen[c] = true
				info.EnabledChecks = append(info.EnabledChecks, c)
			}
		}
	}
	return info, nil
}

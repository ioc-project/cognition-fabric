package engine

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/engine/evidence"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/engine/evidence/a2a"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/engine/evidence/llm"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/engine/evidence/mcp"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/engine/evidence/topology"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/engine/identity"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/inbox"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/oxp"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/pkg/policy"
	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
)

// contentEngine is one MAS: the identity decision first, then, for a route that a content rule covers, the
// judge of the evidence that rule names. A route no content rule covers keeps the identity-only decision and
// reports atomic context.
type contentEngine struct {
	cev1.UnimplementedCognitionEngineServer
	identity *identity.Engine
	rules    []evidence.Rule
	judges   map[string]evidence.Judge // by the evidence kind of the policy
}

// contentOptions wires the judges of a contentEngine.
type contentOptions struct {
	OXPURL     string        // empty disables tool_input evidence
	Wait       time.Duration // bounds the wait for context
	Inbox      *inbox.Inbox  // pre-call events; nil makes event evidence missing context
	ToolPrefix string        // stripped from a destination to get the Observe tool name
}

func newContentEngine(id *identity.Engine, o contentOptions) *contentEngine {
	var client *oxp.Client
	if url := strings.TrimRight(o.OXPURL, "/"); url != "" {
		client = &oxp.Client{Base: url, HTTP: &http.Client{Timeout: time.Second}}
	}
	return &contentEngine{
		identity: id,
		rules:    evidence.Compile(id.Policy.ContentRules),
		judges: map[string]evidence.Judge{
			policy.EvidenceToolInput:       topology.New(client, o.Wait, o.ToolPrefix),
			policy.EvidenceLLMInput:        llm.New(o.Inbox, o.Wait),
			policy.EvidenceMCPToolInput:    mcp.New(o.Inbox, o.Wait),
			policy.EvidenceA2AMessageInput: a2a.New(o.Inbox, o.Wait),
		},
	}
}

func (s *contentEngine) GetInfo(ctx context.Context, r *cev1.GetInfoRequest) (*cev1.GetInfoResponse, error) {
	info, err := s.identity.GetInfo(ctx, r)
	if err != nil {
		return nil, err
	}
	for _, rule := range s.rules {
		info.EnabledChecks = append(info.EnabledChecks, rule.ID)
	}
	info.MatcherStrategy = "exact-identity-policy; session context from OXP; content rules by tool name"
	return info, nil
}

func (s *contentEngine) rulesFor(source, destination string) []evidence.Rule {
	var out []evidence.Rule
	for _, rule := range s.rules {
		if policy.Matches(rule.Destinations, destination) && policy.Matches(rule.Sources, source) {
			out = append(out, rule)
		}
	}
	return out
}

func (s *contentEngine) Evaluate(ctx context.Context, r *cev1.EvaluateRequest) (*cev1.EvaluateResponse, error) {
	started := time.Now()
	out, err := s.identity.Evaluate(ctx, r)
	if err != nil || out.Outcome != cev1.Decision_DECISION_ALLOW {
		return out, err
	}
	rules := s.rulesFor(r.SourceAgentId, r.DestinationAgentId)
	if len(rules) == 0 || r.ActionClass == cev1.ActionClass_ACTION_CLASS_MCP_TOOL_CALL || r.ActionClass == cev1.ActionClass_ACTION_CLASS_AGENT_RESPONSE {
		return out, nil
	}
	// One destination is judged from one kind of evidence (the policy decoder enforces it).
	return s.judges[rules[0].EvidenceKind()].Evaluate(ctx, r, out, rules, started), nil
}

package engine

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/engine/evidence"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/engine/evidence/correlation"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/engine/identity"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/inbox"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/logging"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/oxp"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/pkg/config"
	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
)

// contentEngine is one MAS: the identity decision first, then, for a route that a content rule covers, the
// judge of the evidence that rule names. A route no content rule covers keeps the identity-only decision and
// reports atomic context.
type contentEngine struct {
	cev1.UnimplementedCognitionEngineServer
	identity *identity.Engine
	store    *oxp.Store
	rules    []evidence.Rule
	judges   map[string]evidence.Judge // by the evidence kind of the config
}

// contentOptions wires the judges of a contentEngine.
type contentOptions struct {
	OXPURL    string        // empty disables OXP history and span fallback
	Wait      time.Duration // bounds the wait for context
	Attempts  int
	RetryWait time.Duration
	Inbox     *inbox.Inbox // pre-call events; nil makes event evidence missing context
	Store     *oxp.Store   // read before content; write only the final decision
}

func newContentEngine(id *identity.Engine, o contentOptions) *contentEngine {
	var client *oxp.Client
	if url := strings.TrimRight(o.OXPURL, "/"); url != "" {
		client = &oxp.Client{Base: url, HTTP: &http.Client{Timeout: time.Second}}
	}
	s := &contentEngine{
		identity: id,
		store:    o.Store,
		rules:    evidence.Compile(id.Config.ContentRules),
		judges:   map[string]evidence.Judge{},
	}
	for _, kind := range []string{config.EvidenceToolInput, config.EvidenceLLMInput, config.EvidenceMCPToolInput, config.EvidenceA2AMessageInput} {
		s.judges[kind] = &correlation.Judge{Client: client, Inbox: o.Inbox, Wait: o.Wait, Attempts: o.Attempts, RetryWait: o.RetryWait, Kind: kind}
	}
	return s
}

func (s *contentEngine) GetInfo(ctx context.Context, r *cev1.GetInfoRequest) (*cev1.GetInfoResponse, error) {
	info, err := s.identity.GetInfo(ctx, r)
	if err != nil {
		return nil, err
	}
	for _, rule := range s.rules {
		info.EnabledChecks = append(info.EnabledChecks, rule.ID)
	}
	info.MatcherStrategy = "exact-identity-config; pre-call trace/span events joined to OXP causal context; session/span fallback"
	return info, nil
}

func (s *contentEngine) rulesFor(source, destination string) []evidence.Rule {
	var out []evidence.Rule
	for _, rule := range s.rules {
		if config.Matches(rule.Destinations, destination) && config.Matches(rule.Sources, source) {
			out = append(out, rule)
		}
	}
	return out
}

func (s *contentEngine) Evaluate(ctx context.Context, r *cev1.EvaluateRequest) (*cev1.EvaluateResponse, error) {
	started := time.Now()
	out, inScope, err := s.identity.Decide(ctx, r)
	if err != nil || !inScope {
		return out, err
	}
	if s.store == nil {
		logging.FromContext(ctx).InfoContext(ctx, "Cognition Store disabled; findings are not read or persisted", "event", "store.skipped", "stage", "STORE")
	}
	if s.store != nil {
		if err := storeCall(ctx, "read", func(ctx context.Context) error { return s.store.Read(ctx, r) }); err != nil {
			return nil, err
		}
	}
	if out.Outcome == cev1.Decision_DECISION_ALLOW {
		rules := s.rulesFor(r.SourceAgentId, r.DestinationAgentId)
		logging.FromContext(ctx).InfoContext(ctx, "Content checks selected from demo config", "event", "content.start", "stage", "CONTENT", "rule_count", len(rules))
		if len(rules) > 0 && r.ActionClass != cev1.ActionClass_ACTION_CLASS_AGENT_RESPONSE {
			out = s.judges[rules[0].EvidenceKind()].Evaluate(ctx, r, out, rules, started)
		} else {
			logging.FromContext(ctx).InfoContext(ctx, "Content evaluation skipped; retaining identity decision", "event", "content.skipped", "stage", "CONTENT", "rule_count", len(rules), "action_class", r.ActionClass.String())
		}
	} else {
		logging.FromContext(ctx).InfoContext(ctx, "Identity denied route; content evaluation skipped", "event", "content.skipped", "stage", "CONTENT")
	}
	// The final check identifies the layer responsible for this response. In
	// particular, a content/context denial must not be attributed to identity ALLOW.
	ruleID := out.ChecksRun[len(out.ChecksRun)-1].CheckId
	if s.store != nil {
		if err := storeCall(ctx, "write", func(ctx context.Context) error { return s.store.Write(ctx, r, out, ruleID) }); err != nil {
			return nil, err
		}
	}

	return out, nil
}

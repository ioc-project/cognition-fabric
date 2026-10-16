package engine

import (
	"errors"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/inbox"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/oxp"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/pkg/policy"

	"context"
	"crypto/sha256"
	"encoding/hex"

	"log"
	"net/http"

	"regexp"
	"strings"
	"sync"
	"time"

	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
)

// The oxp-session profile follows the CE/CF/OXP integration flow: the submit carries only
// references, so the CE builds the context itself from OXP. It applies the identity policy
// first, then reads the tool input of the submitted session from OXP and evaluates the
// policy's content rules against it. A destination that no content rule covers keeps the
// identity-only decision and reports atomic context.
//
// Known limits, none of them hidden:
//   - OXP's live topology holds one node per tool name, so the CE binds the tool input to
//     the submit by tool name, not by an exact call identifier. A node that was already used
//     for an earlier submit of the same session is never reused: the CE cannot bind it to
//     this call and denies with missing context instead of judging a stale input.
//   - The session reference is asserted by the sender. OXP exposes no trace-to-session lookup
//     before the span ends, so the CE cannot confirm it and says so in its log.
type sessionEngine struct {
	cev1.UnimplementedCognitionEngineServer
	base   *engine
	oxp    *oxp.Client // nil when OXP is not configured: no tool_input evidence
	wait   time.Duration
	rules  []compiledContentRule
	events *inbox.Inbox // pre-call events pushed by the event exporter; read for llm_input rules
	mu     sync.Mutex
	used   map[string]string
}

type compiledContentRule struct {
	policy.ContentRule
	re *regexp.Regexp
}

const maxUsedNodes = 4096

func newSessionEngine(base *engine, oxpURL string, wait time.Duration) *sessionEngine {
	s := &sessionEngine{base: base, wait: wait, used: map[string]string{}}
	if oxpURL = strings.TrimRight(oxpURL, "/"); oxpURL != "" {
		s.oxp = &oxp.Client{Base: oxpURL, HTTP: &http.Client{Timeout: time.Second}}
	}
	for _, r := range base.policy.ContentRules {
		s.rules = append(s.rules, compiledContentRule{r, regexp.MustCompile(r.Pattern)})
	}
	return s
}

func (s *sessionEngine) GetInfo(ctx context.Context, r *cev1.GetInfoRequest) (*cev1.GetInfoResponse, error) {
	info, err := s.base.GetInfo(ctx, r)
	if err != nil {
		return nil, err
	}
	for _, rule := range s.rules {
		info.EnabledChecks = append(info.EnabledChecks, rule.ID)
	}
	info.MatcherStrategy = "exact-identity-policy; session context from OXP; content rules by tool name"
	return info, nil
}

// toolPrefix is stripped from a destination identity before it is matched to an Observe tool name
// (CE_TOOL_PREFIX, empty by default); the router sets it once at startup.
var toolPrefix string

// toolNameFor maps a registered destination identity to the Observe tool name.
func toolNameFor(destination string) string {
	return strings.ReplaceAll(strings.TrimPrefix(destination, toolPrefix), "-", "_")
}

func toolQueryOf(input any) string {
	object, _ := input.(map[string]any)
	kwargs, _ := object["kwargs"].(map[string]any)
	query, _ := kwargs["query"].(string)
	return query
}

func (s *sessionEngine) topologyOf(ctx context.Context, session string) ([]oxp.Node, error) {
	if s.oxp == nil {
		return nil, errNoOXP
	}
	return s.oxp.Topology(ctx, session)
}

var errNoOXP = errors.New("OXP_API_URL is not configured")

func (s *sessionEngine) rulesFor(source, destination string) []compiledContentRule {
	var out []compiledContentRule
	for _, rule := range s.rules {
		if policy.Matches(rule.Destinations, destination) && policy.Matches(rule.Sources, source) {
			out = append(out, rule)
		}
	}
	return out
}

func missingContext(out *cev1.EvaluateResponse, cause cev1.MissingContextCause, reason string) *cev1.EvaluateResponse {
	out.Outcome = cev1.Decision_DECISION_DENY
	out.DenialReason = cev1.DenialReason_DENIAL_REASON_MISSING_CONTEXT
	out.MissingContextCause = cause
	out.Reason = reason
	out.ChecksRun = append(out.ChecksRun, &cev1.CheckResult{CheckId: "OXP_SESSION_CONTEXT", Passed: false, Reason: reason})
	return out
}

// claim records which submit consumed a topology node. It reports false when the node was
// already consumed by a different submit, so a stale input is never judged twice.
func (s *sessionEngine) claim(key, submit string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if owner, ok := s.used[key]; ok {
		return owner == submit
	}
	if len(s.used) >= maxUsedNodes {
		s.used = map[string]string{}
	}
	s.used[key] = submit
	return true
}

func (s *sessionEngine) Evaluate(ctx context.Context, r *cev1.EvaluateRequest) (*cev1.EvaluateResponse, error) {
	started := time.Now()
	out, err := s.base.Evaluate(ctx, r)
	if err != nil || out.Outcome != cev1.Decision_DECISION_ALLOW {
		return out, err
	}
	rules := s.rulesFor(r.SourceAgentId, r.DestinationAgentId)
	if len(rules) == 0 || r.ActionClass == cev1.ActionClass_ACTION_CLASS_MCP_TOOL_CALL || r.ActionClass == cev1.ActionClass_ACTION_CLASS_AGENT_RESPONSE {
		return out, nil
	}
	switch rules[0].EvidenceKind() {
	case policy.EvidenceLLMInput:
		return s.evaluateLLM(ctx, r, out, rules, started), nil
	case policy.EvidenceMCPToolInput:
		return s.evaluateMCP(ctx, r, out, rules, started), nil
	case policy.EvidenceA2AMessageInput:
		return s.evaluateA2A(ctx, r, out, rules, started), nil
	}
	// CFN may fill the typed field; the registered extra key is what the current CFN forwards.
	session := r.SessionId
	if session == "" {
		session = r.Extra["ioc.observe.session_id"]
	}
	if session == "" {
		log.Printf("flow component=policy-ce event=oxp_session trace_id=%s span_id=%s available=false cause=gap elapsed_ms=%d", r.TraceId, r.SpanId, time.Since(started).Milliseconds())
		return missingContext(out, cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_GAP, "the submit carries no session reference"), nil
	}
	tool := toolNameFor(r.DestinationAgentId)
	waitCtx, cancel := context.WithTimeout(ctx, s.wait)
	defer cancel()
	var node oxp.Node
	var query string
	sawStale := false
	for query == "" {
		if nodes, terr := s.topologyOf(waitCtx, session); terr == nil {
			for _, n := range nodes {
				if n.Type != "tool" || n.Name != tool {
					continue
				}
				q := toolQueryOf(n.Data.Input)
				if q == "" {
					continue
				}
				// A node already consumed by an earlier submit describes that call. The
				// next call's input may simply not have landed yet, so keep waiting.
				digest := sha256.Sum256([]byte(n.StartTime + "\x00" + q))
				if s.claim(session+"|"+tool+"|"+hex.EncodeToString(digest[:8]), r.TraceId+"/"+r.SpanId) {
					node, query = n, q
				} else {
					sawStale = true
				}
			}
		}
		if query != "" {
			break
		}
		select {
		case <-waitCtx.Done():
			if sawStale {
				log.Printf("flow component=policy-ce event=oxp_session trace_id=%s span_id=%s available=false cause=gap reason=stale_node elapsed_ms=%d", r.TraceId, r.SpanId, time.Since(started).Milliseconds())
				return missingContext(out, cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_GAP, "the tool node was already used by an earlier submit of this session and cannot be bound to this call"), nil
			}
			log.Printf("flow component=policy-ce event=oxp_session trace_id=%s span_id=%s available=false cause=race elapsed_ms=%d", r.TraceId, r.SpanId, time.Since(started).Milliseconds())
			return missingContext(out, cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_RACE, "the tool input was not visible in OXP before the wait limit"), nil
		case <-time.After(50 * time.Millisecond):
		}
	}
	hit := ""
	for _, rule := range rules {
		if rule.re.MatchString(query) {
			hit = rule.ID
			break
		}
	}
	out.ContextSufficiency = cev1.ContextSufficiency_CONTEXT_SUFFICIENCY_COMPLETE
	check := &cev1.CheckResult{CheckId: "DEMO_CONTENT_POLICY", Passed: hit == "", Reason: "tool input of the session read from OXP and matched by tool name"}
	if hit != "" {
		out.Outcome = cev1.Decision_DECISION_DENY
		out.DenialReason = cev1.DenialReason_DENIAL_REASON_DEVIATES_FROM_INTENT
		out.Reason = "deterministic content rule " + hit
		check.Reason = out.Reason
	}
	out.ChecksRun = append(out.ChecksRun, check)
	log.Printf("flow component=policy-ce event=oxp_session trace_id=%s span_id=%s available=true session_confirmed=false tool_status=%s rule_hit=%q outcome=%s elapsed_ms=%d", r.TraceId, r.SpanId, node.Status, hit, out.Outcome, time.Since(started).Milliseconds())
	return out, nil
}

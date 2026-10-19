// Package topology judges tool_input evidence. It follows the CE/CF/OXP integration flow: the submit carries only
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
package topology

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/engine/evidence"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/oxp"
	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
)

// Judge reads tool_input evidence: the tool input of the submitted session, from OXP live topology.
type Judge struct {
	OXP *oxp.Client // nil when OXP is not configured: every submit is missing context
	// Wait bounds the wait for the tool input to land in the topology.
	Wait time.Duration
	// ToolPrefix is stripped from a destination identity before it is matched to an Observe tool name.
	ToolPrefix string
	mu         sync.Mutex
	used       map[string]string
}

// New returns the judge of tool_input evidence.
func New(client *oxp.Client, wait time.Duration, toolPrefix string) *Judge {
	return &Judge{OXP: client, Wait: wait, ToolPrefix: toolPrefix, used: map[string]string{}}
}

const maxUsedNodes = 4096

// toolName maps a registered destination identity to the Observe tool name.
func (j *Judge) toolName(destination string) string {
	return strings.ReplaceAll(strings.TrimPrefix(destination, j.ToolPrefix), "-", "_")
}

func toolQueryOf(input any) string {
	object, _ := input.(map[string]any)
	kwargs, _ := object["kwargs"].(map[string]any)
	query, _ := kwargs["query"].(string)
	return query
}

var errNoOXP = errors.New("OXP_API_URL is not configured")

func (j *Judge) topologyOf(ctx context.Context, session string) ([]oxp.Node, error) {
	if j.OXP == nil {
		return nil, errNoOXP
	}
	return j.OXP.Topology(ctx, session)
}

// claim records which submit consumed a topology node. It reports false when the node was
// already consumed by a different submit, so a stale input is never judged twice.
func (j *Judge) claim(key, submit string) bool {
	j.mu.Lock()
	defer j.mu.Unlock()
	if owner, ok := j.used[key]; ok {
		return owner == submit
	}
	if len(j.used) >= maxUsedNodes {
		j.used = map[string]string{}
	}
	j.used[key] = submit
	return true
}

func (j *Judge) Evaluate(ctx context.Context, r *cev1.EvaluateRequest, out *cev1.EvaluateResponse, rules []evidence.Rule, started time.Time) *cev1.EvaluateResponse {
	// CFN may fill the typed field; the registered extra key is what the current CFN forwards.
	session := r.SessionId
	if session == "" {
		session = r.Extra["ioc.observe.session_id"]
	}
	if session == "" {
		log.Printf("flow component=policy-ce event=oxp_session trace_id=%s span_id=%s available=false cause=gap elapsed_ms=%d", r.TraceId, r.SpanId, time.Since(started).Milliseconds())
		return evidence.MissingContext(out, cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_GAP, "the submit carries no session reference")
	}
	tool := j.toolName(r.DestinationAgentId)
	waitCtx, cancel := context.WithTimeout(ctx, j.Wait)
	defer cancel()
	var node oxp.Node
	var query string
	sawStale := false
	for query == "" {
		if nodes, terr := j.topologyOf(waitCtx, session); terr == nil {
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
				if j.claim(session+"|"+tool+"|"+hex.EncodeToString(digest[:8]), r.TraceId+"/"+r.SpanId) {
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
				return evidence.MissingContext(out, cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_GAP, "the tool node was already used by an earlier submit of this session and cannot be bound to this call")
			}
			log.Printf("flow component=policy-ce event=oxp_session trace_id=%s span_id=%s available=false cause=race elapsed_ms=%d", r.TraceId, r.SpanId, time.Since(started).Milliseconds())
			return evidence.MissingContext(out, cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_RACE, "the tool input was not visible in OXP before the wait limit")
		case <-time.After(50 * time.Millisecond):
		}
	}
	hit := ""
	for _, rule := range rules {
		if rule.Re.MatchString(query) {
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
	return out
}

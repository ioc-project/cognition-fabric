// Package events is the judge shared by the evidence the application publishes before it sends a request
// (llm, mcp and a2a): the event is found in the inbox by the exact trace and span of the submit.
package events

import (
	"context"
	"encoding/json"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/engine/evidence"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/inbox"
	"log"
	"time"

	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
)

// Extract reads the session and the judgeable texts out of one inbox event of the submit r; ok is false
// when the event is not the pre-call event this kind of evidence needs.
type Extract func(r *cev1.EvaluateRequest, raw json.RawMessage) (session string, texts []evidence.Text, ok bool)

// Judge is the decision for evidence published before the call. Kind names the evidence in the log.
type Judge struct {
	Inbox   *inbox.Inbox
	Wait    time.Duration
	Kind    string
	Extract Extract
}

// Evaluate is the decision for evidence the application publishes before it sends a request
// (llm_input and mcp_tool_input). The event is found by the exact trace and span of the submit, so
// there is no matching by name. A missing event before CE_CONTEXT_WAIT is RACE, an event of another
// session than the submitted one is GAP, and both deny.
func (j *Judge) Evaluate(ctx context.Context, r *cev1.EvaluateRequest, out *cev1.EvaluateResponse, rules []evidence.Rule, started time.Time) *cev1.EvaluateResponse {
	logOutcome := func(format string, args ...any) {
		log.Printf("flow component=demo-ce event=oxp_event trace_id=%s span_id=%s evidence=%s "+format+" elapsed_ms=%d",
			append(append([]any{r.TraceId, r.SpanId, j.Kind}, args...), time.Since(started).Milliseconds())...)
	}
	if j.Inbox == nil {
		logOutcome("available=false cause=gap reason=no_inbox")
		return evidence.MissingContext(out, cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_GAP, "this CE has no event inbox to read pre-call requests from")
	}
	asserted := r.SessionId
	if asserted == "" {
		asserted = r.Extra["ioc.observe.session_id"]
	}
	waitCtx, cancel := context.WithTimeout(ctx, j.Wait)
	defer cancel()
	for {
		for _, raw := range j.Inbox.Lookup(r.TraceId, r.SpanId) {
			session, texts, ok := j.Extract(r, raw)
			if !ok {
				continue
			}
			if asserted != "" && session != "" && asserted != session {
				logOutcome("available=false cause=gap reason=session_mismatch")
				return evidence.MissingContext(out, cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_GAP, "the pre-call event belongs to another session than the one submitted")
			}
			hit := ""
			for _, text := range texts {
				for _, rule := range rules {
					if hit == "" && rule.Judges(text.Role) && rule.Re.MatchString(text.Text) {
						hit = rule.ID
					}
				}
			}
			out.ContextSufficiency = cev1.ContextSufficiency_CONTEXT_SUFFICIENCY_COMPLETE.Enum()
			check := &cev1.CheckResult{CheckId: "DEMO_CONTENT_CONFIG", Passed: hit == "", Reason: "request published before the call, bound by exact trace and span"}
			if hit != "" {
				out.Outcome = cev1.Decision_DECISION_DENY
				out.DenialReason = cev1.DenialReason_DENIAL_REASON_DEVIATES_FROM_INTENT.Enum()
				out.Reason = "deterministic content rule " + hit
				check.Reason = out.Reason
			}
			out.ChecksRun = append(out.ChecksRun, check)
			// A route without a session reference can only be bound by the exact span; the session is compared
			// when the sender asserted one.
			confirmed := "na"
			if asserted != "" {
				confirmed = "true"
			}
			logOutcome("available=true binding=exact_span session_confirmed=%s rule_hit=%q outcome=%s", confirmed, hit, out.Outcome)
			return out
		}
		select {
		case <-waitCtx.Done():
			logOutcome("available=false cause=race")
			return evidence.MissingContext(out, cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_RACE,
				"no pre-call event for this trace and span before the wait limit; the event must be emitted before the request is sent")
		case <-time.After(25 * time.Millisecond):
		}
	}
}

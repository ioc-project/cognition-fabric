package engine

import (
	"context"
	"encoding/json"
	"log"
	"time"

	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
)

// extractFunc reads the session and the judgeable texts out of one inbox event; ok is false when the
// event is not the pre-call event this kind of evidence needs.
type extractFunc func(raw json.RawMessage) (session string, texts []llmText, ok bool)

// evaluateFromInbox is the decision for evidence the application publishes before it sends a request
// (llm_input and mcp_tool_input). The event is found by the exact trace and span of the submit, so
// there is no matching by name. A missing event before CE_CONTEXT_WAIT is RACE, an event of another
// session than the submitted one is GAP, and both deny.
func (s *sessionEngine) evaluateFromInbox(ctx context.Context, r *cev1.EvaluateRequest, out *cev1.EvaluateResponse, rules []compiledContentRule, started time.Time, evidence string, extract extractFunc) *cev1.EvaluateResponse {
	logOutcome := func(format string, args ...any) {
		log.Printf("flow component=policy-ce event=oxp_event trace_id=%s span_id=%s evidence=%s "+format+" elapsed_ms=%d",
			append(append([]any{r.TraceId, r.SpanId, evidence}, args...), time.Since(started).Milliseconds())...)
	}
	if s.events == nil {
		logOutcome("available=false cause=gap reason=no_inbox")
		return missingContext(out, cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_GAP, "this CE has no event inbox to read pre-call requests from")
	}
	asserted := r.SessionId
	if asserted == "" {
		asserted = r.Extra["ioc.observe.session_id"]
	}
	waitCtx, cancel := context.WithTimeout(ctx, s.wait)
	defer cancel()
	for {
		for _, raw := range s.events.Lookup(r.TraceId, r.SpanId) {
			session, texts, ok := extract(raw)
			if !ok {
				continue
			}
			if asserted != "" && session != "" && asserted != session {
				logOutcome("available=false cause=gap reason=session_mismatch")
				return missingContext(out, cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_GAP, "the pre-call event belongs to another session than the one submitted")
			}
			hit := ""
			for _, text := range texts {
				for _, rule := range rules {
					if hit == "" && rule.judges(text.role) && rule.re.MatchString(text.text) {
						hit = rule.ID
					}
				}
			}
			out.ContextSufficiency = cev1.ContextSufficiency_CONTEXT_SUFFICIENCY_COMPLETE
			check := &cev1.CheckResult{CheckId: "DEMO_CONTENT_POLICY", Passed: hit == "", Reason: "request published before the call, bound by exact trace and span"}
			if hit != "" {
				out.Outcome = cev1.Decision_DECISION_DENY
				out.DenialReason = cev1.DenialReason_DENIAL_REASON_DEVIATES_FROM_INTENT
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
			return missingContext(out, cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_RACE,
				"no pre-call event for this trace and span before the wait limit; the event must be emitted before the request is sent")
		case <-time.After(25 * time.Millisecond):
		}
	}
}

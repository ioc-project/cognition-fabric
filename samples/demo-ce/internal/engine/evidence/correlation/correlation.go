// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

// Package correlation joins Observe pre-call inputs with causal OXP context.
package correlation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"sort"
	"time"

	cev1 "github.com/cisco-eti/cognition-fabric/api/ce/v1"
	"github.com/cisco-eti/cognition-fabric/samples/demo-ce/internal/engine/evidence"
	"github.com/cisco-eti/cognition-fabric/samples/demo-ce/internal/engine/evidence/events"
	"github.com/cisco-eti/cognition-fabric/samples/demo-ce/internal/inbox"
	"github.com/cisco-eti/cognition-fabric/samples/demo-ce/internal/logging"
	"github.com/cisco-eti/cognition-fabric/samples/demo-ce/internal/oxp"
	"github.com/cisco-eti/cognition-fabric/samples/demo-ce/pkg/config"
)

type Judge struct {
	Client    *oxp.Client
	Inbox     *inbox.Inbox
	Wait      time.Duration
	Attempts  int
	RetryWait time.Duration
	Kind      string
}

type currentEvent struct {
	session          string
	texts            []evidence.Text
	definitionsKnown bool
	snapshot         []json.RawMessage
	realtime         bool   // read from the OXP realtime endpoints, not the inbox
	via              string // how the realtime event was found
}

var errPreCallAvailable = errors.New("pre-call evidence arrived during OXP lookup")

func (j *Judge) Evaluate(ctx context.Context, r *cev1.EvaluateRequest, out *cev1.EvaluateResponse, rules []evidence.Rule, _ time.Time) *cev1.EvaluateResponse {
	if j.Kind == config.EvidenceMCPToolInput && r.ActionClass != cev1.ActionClass_ACTION_CLASS_MCP_TOOL_CALL && r.Extra["ioc.item.kind"] != "tool_call" {
		return out
	}
	session := r.SessionId
	if session == "" {
		session = r.Extra["ioc.observe.session_id"]
	}
	if j.Inbox == nil && (j.Client == nil || session == "") && !j.hasRealtimeRef(r) {
		return evidence.MissingContext(out, cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_GAP, "no pre-call inbox or OXP session reference")
	}
	waitCtx, cancel := context.WithTimeout(ctx, j.Wait)
	defer cancel()
	attempts, retryWait := j.Attempts, j.RetryWait
	if attempts <= 0 {
		attempts = 5
	}
	if retryWait <= 0 {
		retryWait = time.Second / 5
	}
	// Revalidating a changed inbox or promoting a newly arrived pre-call event
	// stays in this attempt. Reuse its lookup instead of bypassing the retry cap.
	var history *oxp.ActivityContext
	var historyErr error
	lookedUp := false
	lookup := func(session string, optional, observeInbox bool) (*oxp.ActivityContext, error) {
		if !lookedUp {
			history, historyErr = j.context(waitCtx, session, r, optional, observeInbox)
			lookedUp = true
		}
		return history, historyErr
	}
	attempt := 1
	for {
		if waitCtx.Err() != nil {
			return evidence.MissingContext(out, cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_RACE, "required input/context was not visible before the decision deadline")
		}
		var snapshot []json.RawMessage
		if j.Inbox != nil {
			snapshot = j.Inbox.Lookup(r.TraceId, r.SpanId)
		}
		// A pre-call event named by the request is read from OXP realtime first; the inbox is the
		// behavior when the request names none, the endpoints fail, or the event is not exposed yet.
		event, rtState, rtErr := j.realtime(waitCtx, r)
		if rtErr != nil {
			return evidence.MissingContext(out, cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_GAP, rtErr.Error())
		}
		present := event != nil
		if event == nil {
			var err error
			event, present, err = j.current(r)
			if err != nil {
				return evidence.MissingContext(out, cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_GAP, err.Error())
			}
		}
		if event != nil {
			if session != "" && session != event.session {
				return evidence.MissingContext(out, cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_GAP, "pre-call event belongs to a different session")
			}
			requireDefinitions := j.Kind == config.EvidenceLLMInput && needsDefinitions(rules) && !event.definitionsKnown
			history, herr := lookup(event.session, !requireDefinitions, false)
			if errors.Is(herr, oxp.ErrInvalidContext) {
				return evidence.MissingContext(out, cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_GAP, herr.Error())
			}
			texts, ready := event.texts, true
			if requireDefinitions {
				ready = false
				if history != nil {
					if defs, ok := definitionTexts(history.Current); ok {
						texts = append(texts, defs...)
						ready = true
					}
				}
			}
			if ready && ctx.Err() == nil {
				// Reparse only if the inbox changed during I/O. A full conversation
				// can be large; parsing it twice consumes the hold budget needlessly.
				if !event.realtime && !reflect.DeepEqual(event.snapshot, j.Inbox.Lookup(r.TraceId, r.SpanId)) {
					continue
				}
				out.ContextSufficiency = cev1.ContextSufficiency_CONTEXT_SUFFICIENCY_COMPLETE.Enum()
				reason := "input published before send, bound by exact trace/span"
				if requireDefinitions {
					out.ContextSufficiency = cev1.ContextSufficiency_CONTEXT_SUFFICIENCY_DEGRADED_ATOMIC.Enum()
					reason = "messages bound by pre-call trace/span; required OXP tool definitions are session/span scoped, trace identity unconfirmed"
				}
				if event.realtime {
					realtimeCheck(out, event.via)
				}
				source := "inbox"
				if event.realtime {
					source = "oxp_realtime"
				}
				logging.FromContext(ctx).InfoContext(ctx, "Pre-call input selected after correlation validation", "event", "evidence.selected", "stage", "EVIDENCE", "source", source, "evidence", j.Kind, "trace_identity_confirmed", true, "oxp_history_available", history != nil, "required_tool_definitions_from_oxp", requireDefinitions)
				j.recordContext(out, history, true)
				return j.decide(ctx, out, rules, texts, reason)
			}
		} else if !present && j.Client != nil && session != "" && rtState != realtimePending {
			// A pending realtime event is awaited rather than replaced by the span's own input.
			history, herr := lookup(session, false, true)
			// Recheck actual presence: a promotion signal can outlive an event
			// evicted from the bounded inbox. Absence remains a failed attempt.
			if _, present, err := j.current(r); present || err != nil {
				continue // pre-call evidence always takes priority over an in-flight fallback
			}
			if errors.Is(herr, oxp.ErrInvalidContext) {
				return evidence.MissingContext(out, cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_GAP, herr.Error())
			}
			if history != nil && waitCtx.Err() == nil {
				if texts, ok := inputTexts(history.Current, j.Kind); ok {
					if j.Kind != config.EvidenceLLMInput || !needsDefinitions(rules) || hasDefinitions(history.Current) {
						out.ContextSufficiency = cev1.ContextSufficiency_CONTEXT_SUFFICIENCY_DEGRADED_ATOMIC.Enum()
						logging.FromContext(ctx).InfoContext(ctx, "Using OXP session/span input as fallback; trace identity is unconfirmed", "event", "evidence.selected", "stage", "EVIDENCE", "source", "oxp_span_fallback", "evidence", j.Kind, "trace_identity_confirmed", false)
						j.recordContext(out, history, false)
						return j.decide(ctx, out, rules, texts, "input of the selected OXP session/span; trace identity unconfirmed")
					}
				}
			}
		}
		if attempt >= attempts {
			return evidence.MissingContext(out, cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_RACE, fmt.Sprintf("required input/context was not visible after %d attempts", attempts))
		}
		logging.FromContext(ctx).InfoContext(ctx, "Required input/context is not ready; retrying within decision budget", "event", "context.retry", "stage", "OXP", "attempt", attempt, "max_attempts", attempts, "retry_wait", retryWait)
		if err := j.waitForRetry(waitCtx, r, retryWait, snapshot); err != nil {
			return evidence.MissingContext(out, cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_RACE, "required input/context was not visible before the decision deadline")
		}
		attempt++
		lookedUp = false
	}
}

// A newly published pre-call input can interrupt the interval between failed
// lookups. Polling the inbox does not issue additional OXP requests.
func (j *Judge) waitForRetry(ctx context.Context, r *cev1.EvaluateRequest, delay time.Duration, snapshot []json.RawMessage) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	ticker := time.NewTicker(25 * time.Millisecond)
	defer ticker.Stop()
	for {
		if j.Inbox != nil && !reflect.DeepEqual(snapshot, j.Inbox.Lookup(r.TraceId, r.SpanId)) {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-timer.C:
			return nil
		case <-ticker.C:
		}
	}
}

// Required context gets the remaining hold budget, preserving pagination progress.
// Observe the inbox while fallback is in flight so pre-call input can take priority.
// Optional history has a 1s timeout within the same hold/caller deadline.
func (j *Judge) context(ctx context.Context, session string, r *cev1.EvaluateRequest, optional, observeInbox bool) (*oxp.ActivityContext, error) {
	if j.Client == nil {
		return nil, nil
	}
	readCtx, cancel := context.WithCancel(ctx)
	if optional {
		cancel()
		readCtx, cancel = context.WithTimeout(ctx, time.Second)
	}
	defer cancel()
	if !observeInbox || j.Inbox == nil {
		return j.Client.SessionContext(readCtx, session, r.SpanId)
	}
	type result struct {
		history *oxp.ActivityContext
		err     error
	}
	done := make(chan result, 1)
	go func() {
		history, err := j.Client.SessionContext(readCtx, session, r.SpanId)
		done <- result{history, err}
	}()
	ticker := time.NewTicker(25 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case got := <-done:
			return got.history, got.err
		case <-readCtx.Done():
			return nil, readCtx.Err()
		case <-ticker.C:
			if _, present, err := j.current(r); present || err != nil {
				return nil, errPreCallAvailable
			}
		}
	}
}

func (j *Judge) recordContext(out *cev1.EvaluateResponse, history *oxp.ActivityContext, exact bool) {
	if history == nil {
		if j.Client != nil {
			out.ChecksRun = append(out.ChecksRun, &cev1.CheckResult{CheckId: "OXP_CAUSAL_CONTEXT", Passed: false, Reason: "optional OXP history not yet visible; current input is bound by the pre-call event"})
		}
		return
	}
	binding := "session/span only; activity and link target trace identities are unconfirmed"
	if exact {
		binding = "pre-call input trace/span confirmed; OXP inputs and ancestors remain session/span scoped"
	}
	out.ChecksRun = append(out.ChecksRun, &cev1.CheckResult{CheckId: "OXP_CAUSAL_CONTEXT", Passed: true, Reason: fmt.Sprintf("%d parent/link ancestors; %s", len(history.Ancestors), binding)})
}

func (j *Judge) decide(ctx context.Context, out *cev1.EvaluateResponse, rules []evidence.Rule, texts []evidence.Text, reason string) *cev1.EvaluateResponse {
	hit := ""
	for _, text := range texts {
		for _, rule := range rules {
			if (j.Kind == config.EvidenceToolInput || rule.Judges(text.Role)) && rule.Re.MatchString(text.Text) {
				hit = rule.ID
				break
			}
		}
		if hit != "" {
			break
		}
	}
	check := &cev1.CheckResult{CheckId: "DEMO_CONTENT_CONFIG", Passed: hit == "", Reason: reason}
	if hit != "" {
		out.Outcome = cev1.Decision_DECISION_DENY
		out.DenialReason = cev1.DenialReason_DENIAL_REASON_DEVIATES_FROM_INTENT.Enum()
		out.Reason = "deterministic content rule " + hit
		check.Reason = out.Reason
	}
	out.ChecksRun = append(out.ChecksRun, check)
	logging.FromContext(ctx).InfoContext(ctx, "Content checks evaluated against selected input", "event", "content.complete", "stage", "CONTENT", "outcome", logging.Outcome(out), "matched_rule", hit, "rule_count", len(rules), "evidence", j.Kind)
	return out
}

func (j *Judge) current(r *cev1.EvaluateRequest) (*currentEvent, bool, error) {
	if j.Inbox == nil {
		return nil, false, nil
	}
	var selected *currentEvent
	present := false
	snapshot := j.Inbox.Lookup(r.TraceId, r.SpanId)
	for _, raw := range snapshot {
		var envelope struct {
			Type    string `json:"type"`
			Session struct {
				ID string `json:"id"`
			} `json:"session"`
			Data struct {
				Input json.RawMessage `json:"input"`
			} `json:"data"`
		}
		if json.Unmarshal(raw, &envelope) != nil {
			continue
		}
		expected := "tool.started"
		if j.Kind == config.EvidenceLLMInput {
			expected = "llm.started"
		}
		if envelope.Type != expected {
			continue
		}
		present = true
		var texts []evidence.Text
		var ok bool
		definitionsKnown := false
		if j.Kind == config.EvidenceLLMInput {
			texts, definitionsKnown, ok = modelInput(envelope.Data.Input)
		} else {
			var callID string
			_, callID, texts, ok = events.ToolEvent(raw)
			if want := r.Extra["ioc.observe.message_id"]; j.Kind == config.EvidenceA2AMessageInput && want != "" && callID != "" && want != callID {
				continue
			}
		}
		if !ok {
			continue
		}
		// Map traversal order is irrelevant to regex rules; normalize before checking
		// whether two events assert conflicting inputs for the same activity.
		sort.Slice(texts, func(a, b int) bool {
			if texts[a].Role != texts[b].Role {
				return texts[a].Role < texts[b].Role
			}
			return texts[a].Text < texts[b].Text
		})
		candidate := &currentEvent{session: envelope.Session.ID, texts: texts, definitionsKnown: definitionsKnown}
		if selected != nil && !reflect.DeepEqual(selected, candidate) {
			return nil, true, errors.New("conflicting pre-call inputs for the submitted activity")
		}
		selected = candidate
	}
	if selected != nil {
		selected.snapshot = snapshot
	}
	return selected, present, nil
}

func needsDefinitions(rules []evidence.Rule) bool {
	for _, r := range rules {
		for _, role := range r.Roles {
			if role == config.RoleToolDefinition {
				return true
			}
		}
	}
	return false
}

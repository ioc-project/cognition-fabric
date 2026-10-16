package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/inbox"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/pkg/policy"
	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
)

func joinedEventEngine(t *testing.T, kind string, roles []string, handler http.HandlerFunc) (*Router, *inbox.Inbox) {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	in := inbox.New("noa-trip-planner-mas", 16)
	p := policy.Policy{Rules: []policy.Rule{{ID: "A", Effect: "ALLOW", Reason: "approved", Sources: []string{"caller"}, Destinations: []string{"target"}}},
		ContentRules: []policy.ContentRule{{ID: "NO_SECRET", Reason: "no secrets", Pattern: "secret-value", Evidence: kind, Roles: roles, Destinations: []string{"target"}}}}
	return New(policy.Set{Single: &p}, Options{MasID: func() (string, error) { return "mas", nil }, OXPURL: server.URL, Inbox: in, Wait: time.Second}), in
}

func eventRequest(event map[string]any) *cev1.EvaluateRequest {
	refs := event["correlation"].(map[string]any)
	r := spanRequest(refs["span_id"].(string))
	r.TraceId = refs["trace_id"].(string)
	r.Extra = map[string]string{"ioc.item.kind": "tool_call"}
	return r
}

func TestPreCallInputCanBeJudgedWhileTheActiveSpanIsPending(t *testing.T) {
	engine, in := joinedEventEngine(t, policy.EvidenceA2AMessageInput, nil, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"spans": []any{}}) // active spans are not queryable yet
	})
	event := llmFixture(t, "a2a_tool_started.json")
	pushEvent(t, in, event)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	out, err := engine.Evaluate(ctx, eventRequest(event))
	if err != nil || out.Outcome != cev1.Decision_DECISION_ALLOW {
		t.Fatalf("pre-call evidence was held waiting for span completion: %+v %v", out, err)
	}
	pending := false
	for _, check := range out.ChecksRun {
		pending = pending || check.CheckId == "OXP_CAUSAL_CONTEXT" && !check.Passed
	}
	if !pending {
		t.Fatalf("missing optional history was not reported: %+v", out)
	}
}

func TestPreCallJoinsHistoryWithinItsEnrichmentBudget(t *testing.T) {
	event := llmFixture(t, "a2a_tool_started.json")
	r := eventRequest(event)
	native := event["session"].(map[string]any)["id"].(string)
	_, canonical, _ := strings.Cut(native, "_")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, rq *http.Request) {
		select {
		case <-rq.Context().Done():
			return
		case <-time.After(150 * time.Millisecond):
		}
		row := evidenceSpan(r.SpanId, "", "send_message", nil)
		row["session_id"] = canonical
		_ = json.NewEncoder(w).Encode(map[string]any{"spans": []any{row}})
	}))
	defer server.Close()
	in := inbox.New("noa-trip-planner-mas", 16)
	pushEvent(t, in, event)
	p := policy.Policy{Rules: []policy.Rule{{ID: "A", Effect: "ALLOW", Reason: "approved", Sources: []string{"caller"}, Destinations: []string{"target"}}}, ContentRules: []policy.ContentRule{{ID: "C", Reason: "no secrets", Pattern: "secret-value", Evidence: policy.EvidenceA2AMessageInput, Destinations: []string{"target"}}}}
	engine := New(policy.Set{Single: &p}, Options{MasID: func() (string, error) { return "mas", nil }, OXPURL: server.URL, Inbox: in, Wait: time.Second})
	out, err := engine.Evaluate(context.Background(), r)
	if err != nil || out.Outcome != cev1.Decision_DECISION_ALLOW {
		t.Fatalf("pre-call input failed: %+v %v", out, err)
	}
	found := false
	for _, check := range out.ChecksRun {
		found = found || check.CheckId == "OXP_CAUSAL_CONTEXT" && check.Passed
	}
	if !found {
		t.Fatalf("available history was discarded within the enrichment budget: %+v", out)
	}
}

func TestPreCallInputSurvivesOptionalHistoryTimeout(t *testing.T) {
	engine, in := joinedEventEngine(t, policy.EvidenceA2AMessageInput, nil, func(w http.ResponseWriter, r *http.Request) { <-r.Context().Done() })
	event := llmFixture(t, "a2a_tool_started.json")
	pushEvent(t, in, event)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	out, err := engine.Evaluate(ctx, eventRequest(event))
	if err != nil || out.Outcome != cev1.Decision_DECISION_ALLOW || out.ContextSufficiency != cev1.ContextSufficiency_CONTEXT_SUFFICIENCY_COMPLETE {
		t.Fatalf("optional history timeout invalidated known pre-call input: %+v %v", out, err)
	}
}

func TestNewPreCallEventIsObservedWhileOXPLags(t *testing.T) {
	entered := make(chan struct{}, 1)
	engine, in := joinedEventEngine(t, policy.EvidenceA2AMessageInput, nil, func(w http.ResponseWriter, r *http.Request) {
		select {
		case entered <- struct{}{}:
		default:
		}
		<-r.Context().Done()
	})
	event := llmFixture(t, "a2a_tool_started.json")
	event["data"].(map[string]any)["input"] = map[string]any{"text": "secret-value"}
	r := eventRequest(event)
	r.Extra["ioc.observe.session_id"] = event["session"].(map[string]any)["id"].(string)
	done := make(chan *cev1.EvaluateResponse, 1)
	go func() { out, _ := engine.Evaluate(context.Background(), r); done <- out }()
	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("OXP fallback did not start")
	}
	pushEvent(t, in, event)
	select {
	case out := <-done:
		if out.Outcome != cev1.Decision_DECISION_DENY || out.DenialReason != cev1.DenialReason_DENIAL_REASON_DEVIATES_FROM_INTENT {
			t.Fatalf("event arriving during OXP lookup was missed: %+v", out)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("decision exceeded the single wait budget")
	}
}

func TestConflictingPreCallInputsAreMissingContext(t *testing.T) {
	var reads atomic.Int32
	engine, in := joinedEventEngine(t, policy.EvidenceA2AMessageInput, nil, func(w http.ResponseWriter, r *http.Request) {
		reads.Add(1)
		_ = json.NewEncoder(w).Encode(map[string]any{"spans": []any{}})
	})
	event := llmFixture(t, "a2a_tool_started.json")
	pushEvent(t, in, event)
	event["data"].(map[string]any)["input"] = map[string]any{"text": "secret-value"}
	pushEvent(t, in, event)
	out, err := engine.Evaluate(context.Background(), eventRequest(event))
	if err != nil || out.Outcome != cev1.Decision_DECISION_DENY || out.MissingContextCause != cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_GAP || reads.Load() != 0 {
		t.Fatalf("conflicting inputs were accepted: %+v %v reads=%d", out, err, reads.Load())
	}
}

func TestPreCallEventArrivingDuringSuccessfulFallbackTakesPriority(t *testing.T) {
	event := llmFixture(t, "a2a_tool_started.json")
	event["data"].(map[string]any)["input"] = map[string]any{"text": "secret-value"}
	r := eventRequest(event)
	session := event["session"].(map[string]any)["id"].(string)
	r.Extra["ioc.observe.session_id"] = session
	var in *inbox.Inbox
	var published atomic.Bool
	engine, eventInbox := joinedEventEngine(t, policy.EvidenceA2AMessageInput, nil, func(w http.ResponseWriter, _ *http.Request) {
		if published.CompareAndSwap(false, true) {
			pushEvent(t, in, event)
		}
		row := evidenceSpan(r.SpanId, "", "tool", map[string]string{"ioa_observe.entity.input": `{"kwargs":{"text":"ordinary trip"}}`})
		_, oxpSession, _ := strings.Cut(session, "_")
		row["session_id"] = oxpSession
		_ = json.NewEncoder(w).Encode(map[string]any{"spans": []any{row}})
	})
	in = eventInbox
	out, err := engine.Evaluate(context.Background(), r)
	if err != nil || out.Outcome != cev1.Decision_DECISION_DENY || out.DenialReason != cev1.DenialReason_DENIAL_REASON_DEVIATES_FROM_INTENT || out.ContextSufficiency != cev1.ContextSufficiency_CONTEXT_SUFFICIENCY_COMPLETE {
		t.Fatalf("new pre-call input lost to clean OXP fallback: %+v %v", out, err)
	}
}

func TestMalformedModelMessagesNeverBecomeAnEmptyAllow(t *testing.T) {
	for _, raw := range []string{`[{}]`, `[{"role":"user","content":"secret-value"}]`, `[{"role":"user","parts":[{"type":"unknown","content":"secret-value"}]}]`, `[{"role":"user","parts":[{"type":"text","content":"ordinary"},{"type":"text"}]}]`} {
		t.Run(raw, func(t *testing.T) {
			engine := spanEngine(t, policy.EvidenceLLMInput, 35*time.Millisecond, func(w http.ResponseWriter, r *http.Request) {
				_ = json.NewEncoder(w).Encode(map[string]any{"spans": []any{evidenceSpan(span, "", "llm", map[string]string{"gen_ai.input.messages": raw})}})
			})
			out, err := engine.Evaluate(context.Background(), spanRequest(span))
			if err != nil || out.Outcome != cev1.Decision_DECISION_DENY || out.DenialReason != cev1.DenialReason_DENIAL_REASON_MISSING_CONTEXT {
				t.Fatalf("malformed messages passed: %+v %v", out, err)
			}
		})
	}
}

func TestModelToolDefinitionsAreJoinedFromTheSelectedSpan(t *testing.T) {
	for _, withDefinitions := range []bool{false, true} {
		t.Run(map[bool]string{false: "absent", true: "present"}[withDefinitions], func(t *testing.T) {
			event := llmFixture(t, "llm_started_genai.json")
			r := eventRequest(event)
			session := event["session"].(map[string]any)["id"].(string)
			engine, in := joinedEventEngine(t, policy.EvidenceLLMInput, []string{policy.RoleToolDefinition}, func(w http.ResponseWriter, _ *http.Request) {
				attrs := map[string]string{"gen_ai.input.messages": `[{"role":"user","parts":[{"type":"text","content":"ordinary trip"}]}]`}
				if withDefinitions {
					attrs["gen_ai.tool.definitions"] = `[{"name":"lookup","description":"secret-value"}]`
				}
				row := evidenceSpan(r.SpanId, "", "llm", attrs)
				_, oxpSession, _ := strings.Cut(session, "_")
				row["session_id"] = oxpSession
				_ = json.NewEncoder(w).Encode(map[string]any{"spans": []any{row}})
			})
			pushEvent(t, in, event)
			out, err := engine.Evaluate(context.Background(), r)
			if err != nil || out.Outcome != cev1.Decision_DECISION_DENY {
				t.Fatalf("definition rule was skipped: %+v %v", out, err)
			}
			if withDefinitions && (!strings.Contains(out.Reason, "NO_SECRET") || out.DenialReason != cev1.DenialReason_DENIAL_REASON_DEVIATES_FROM_INTENT) {
				t.Fatalf("definition was not judged: %+v", out)
			}
			if withDefinitions && out.ContextSufficiency != cev1.ContextSufficiency_CONTEXT_SUFFICIENCY_DEGRADED_ATOMIC {
				t.Fatalf("OXP definitions falsely claimed exact trace binding: %+v", out)
			}
			if !withDefinitions && out.DenialReason != cev1.DenialReason_DENIAL_REASON_MISSING_CONTEXT {
				t.Fatalf("missing definitions were treated as empty: %+v", out)
			}
		})
	}
}

func TestMalformedNativeDefinitionsAreMissingContext(t *testing.T) {
	for _, tools := range []string{`[{}]`, `[{"function":{"description":"secret-value"}}]`, `{"name":"lookup","description":"secret-value"}`} {
		t.Run(tools, func(t *testing.T) {
			event := llmFixture(t, "llm_started_genai.json")
			var input any
			if err := json.Unmarshal([]byte(`{"messages":[{"role":"user","content":"ordinary trip"}],"tools":`+tools+`}`), &input); err != nil {
				t.Fatal(err)
			}
			event["data"].(map[string]any)["input"] = input
			in := inbox.New("noa-trip-planner-mas", 16)
			pushEvent(t, in, event)
			p := policy.Policy{Rules: []policy.Rule{{ID: "A", Effect: "ALLOW", Reason: "approved", Sources: []string{"caller"}, Destinations: []string{"target"}}}, ContentRules: []policy.ContentRule{{ID: "C", Reason: "no secrets", Pattern: "secret-value", Evidence: policy.EvidenceLLMInput, Roles: []string{policy.RoleToolDefinition}, Destinations: []string{"target"}}}}
			engine := New(policy.Set{Single: &p}, Options{MasID: func() (string, error) { return "mas", nil }, Inbox: in, Wait: 35 * time.Millisecond})
			out, err := engine.Evaluate(context.Background(), eventRequest(event))
			if err != nil || out.Outcome != cev1.Decision_DECISION_DENY || out.DenialReason != cev1.DenialReason_DENIAL_REASON_MISSING_CONTEXT {
				t.Fatalf("malformed definitions passed: %+v %v", out, err)
			}
		})
	}
}

func TestRequiredOXPContextCanFinishPaginationWithinTheHoldBudget(t *testing.T) {
	engine := spanEngine(t, policy.EvidenceToolInput, time.Second, func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
			return
		case <-time.After(60 * time.Millisecond):
		}
		rows := []any{}
		if r.URL.Query().Get("offset") == "0" {
			for n := 1; n <= 500; n++ {
				rows = append(rows, evidenceSpan(fmt.Sprintf("%016x", n), "", "agent", nil))
			}
		} else {
			rows = append(rows, evidenceSpan(span, "", "tool", map[string]string{"ioa_observe.entity.input": `{"kwargs":{"query":"secret-value"}}`}))
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"spans": rows})
	})
	out, err := engine.Evaluate(context.Background(), spanRequest(span))
	if err != nil || out.Outcome != cev1.Decision_DECISION_DENY || out.DenialReason != cev1.DenialReason_DENIAL_REASON_DEVIATES_FROM_INTENT {
		t.Fatalf("pagination lost progress inside hold budget: %+v %v", out, err)
	}
}

package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/inbox"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/pkg/policy"
	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
)

// realtimeEvent is a tool.started event as OXP's realtime endpoints return it.
func realtimeEvent(id, parent, traceID, spanID, query string) map[string]any {
	correlation := map[string]any{"trace_id": traceID, "span_id": spanID, "trace_flags": 3}
	if parent != "" {
		correlation["parent_event_id"] = parent
	}
	return map[string]any{"event_id": id, "type": "tool.started", "correlation": correlation,
		"session": map[string]any{"id": sessionID, "sequence": 1},
		"data":    map[string]any{"tool": map[string]any{"name": "lookup"}, "input": map[string]any{"kwargs": map[string]any{"query": query}}}}
}

// fakeRealtime serves the three realtime endpoints from a mutable set of events.
type fakeRealtime struct {
	mu        sync.Mutex
	events    []map[string]any
	status    int // non-zero makes every realtime endpoint answer this status
	eventGets atomic.Int32
	spanGets  atomic.Int32
}

func (f *fakeRealtime) add(e map[string]any) {
	f.mu.Lock()
	f.events = append(f.events, e)
	f.mu.Unlock()
}

func (f *fakeRealtime) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	path := r.URL.Path
	switch {
	case strings.HasPrefix(path, "/api/v1/realtime/") && f.status != 0:
		w.WriteHeader(f.status)
	case strings.HasPrefix(path, "/api/v1/realtime/events/"):
		f.eventGets.Add(1)
		for _, e := range f.events {
			if e["event_id"] == strings.TrimPrefix(path, "/api/v1/realtime/events/") {
				_ = json.NewEncoder(w).Encode(e)
				return
			}
		}
		w.WriteHeader(http.StatusNotFound)
	case strings.HasPrefix(path, "/api/v1/realtime/spans/") && strings.HasSuffix(path, "/events"):
		f.spanGets.Add(1)
		spanID := strings.TrimSuffix(strings.TrimPrefix(path, "/api/v1/realtime/spans/"), "/events")
		list := []any{}
		for _, e := range f.events {
			if e["correlation"].(map[string]any)["span_id"] == spanID && e["type"] == r.URL.Query().Get("event_types") {
				list = append(list, e)
			}
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"session_id": sessionID, "events": list, "has_more": false})
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

func realtimeEngine(t *testing.T, kind string, f http.Handler, in *inbox.Inbox) *Router {
	t.Helper()
	srv := httptest.NewServer(f)
	t.Cleanup(srv.Close)
	return New(policy.Set{Single: &policy.Policy{
		Rules:        []policy.Rule{{ID: "ALLOW_ROUTE", Effect: "ALLOW", Reason: "approved", Sources: []string{"caller"}, Destinations: []string{"target"}}},
		ContentRules: []policy.ContentRule{{ID: "NO_SECRET", Reason: "no secrets", Pattern: "secret-value", Evidence: kind, Destinations: []string{"target"}}},
	}}, Options{MasID: func() (string, error) { return "mas", nil }, OXPURL: srv.URL, Inbox: in, Wait: time.Second, Attempts: 5, RetryWait: 20 * time.Millisecond})
}

func realtimeRequest(extra map[string]string) *cev1.EvaluateRequest {
	r := spanRequest(span)
	for k, v := range extra {
		r.Extra[k] = v
	}
	return r
}

func hasCheck(out *cev1.EvaluateResponse, id string) bool {
	for _, c := range out.ChecksRun {
		if c.CheckId == id {
			return true
		}
	}
	return false
}

func TestRealtimeDirectEventIDJudgesItsInput(t *testing.T) {
	for query, want := range map[string]cev1.Decision{"ordinary trip": cev1.Decision_DECISION_ALLOW, "secret-value": cev1.Decision_DECISION_DENY} {
		f := &fakeRealtime{}
		f.add(realtimeEvent("pre1", "msg1", trace, span, query))
		f.add(realtimeEvent("other", "msg1", trace, span, "unrelated"))
		out, err := realtimeEngine(t, policy.EvidenceToolInput, f, nil).Evaluate(context.Background(), realtimeRequest(map[string]string{"ioc.observe.precall_event_id": "pre1", "ioc.observe.event_id": "msg1"}))
		if err != nil || out.Outcome != want || !hasCheck(out, "OXP_REALTIME_EVENT") || out.ContextSufficiency != cev1.ContextSufficiency_CONTEXT_SUFFICIENCY_COMPLETE {
			t.Fatalf("%s: %+v %v", query, out, err)
		}
		if f.spanGets.Load() != 0 {
			t.Fatal("the direct id must not list the span")
		}
	}
}

func TestRealtimeParentFallbackSeparatesParallelRequestsOfOneSpan(t *testing.T) {
	f := &fakeRealtime{}
	want := map[string]cev1.Decision{}
	for n := 0; n < 8; n++ {
		query := fmt.Sprintf("trip %d", n)
		want[fmt.Sprintf("msg%d", n)] = cev1.Decision_DECISION_ALLOW
		if n == 5 {
			query, want["msg5"] = "secret-value", cev1.Decision_DECISION_DENY
		}
		f.add(realtimeEvent(fmt.Sprintf("pre%d", n), fmt.Sprintf("msg%d", n), trace, span, query))
	}
	engine := realtimeEngine(t, policy.EvidenceToolInput, f, nil)
	var wg sync.WaitGroup
	for parent, decision := range want {
		wg.Go(func() {
			out, err := engine.Evaluate(context.Background(), realtimeRequest(map[string]string{"ioc.observe.event_id": parent}))
			if err != nil || out.Outcome != decision || !hasCheck(out, "OXP_REALTIME_EVENT") {
				t.Errorf("%s: %+v %v", parent, out, err)
			}
		})
	}
	wg.Wait()
}

func TestRealtimeWaitsForTheEventToBeIngested(t *testing.T) {
	for name, extra := range map[string]map[string]string{"direct": {"ioc.observe.precall_event_id": "pre1"}, "parent": {"ioc.observe.event_id": "msg1"}} {
		t.Run(name, func(t *testing.T) {
			f := &fakeRealtime{}
			go func() {
				time.Sleep(80 * time.Millisecond)
				f.add(realtimeEvent("pre1", "msg1", trace, span, "secret-value"))
			}()
			out, err := realtimeEngine(t, policy.EvidenceToolInput, f, nil).Evaluate(context.Background(), realtimeRequest(extra))
			if err != nil || out.Outcome != cev1.Decision_DECISION_DENY || out.DenialReason != cev1.DenialReason_DENIAL_REASON_DEVIATES_FROM_INTENT {
				t.Fatalf("%+v %v", out, err)
			}
		})
	}
}

// While the referenced event is pending the span's own input must not stand in for it: in parallel calls it
// can be another request's input.
func TestRealtimePendingNeverFallsBackToTheSpanInput(t *testing.T) {
	f := &fakeRealtime{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/v1/sessions/") {
			_ = json.NewEncoder(w).Encode(map[string]any{"spans": []any{evidenceSpan(span, "", "tool", map[string]string{"ioa_observe.entity.input": `{"kwargs":{"query":"ordinary trip"}}`})}})
			return
		}
		f.ServeHTTP(w, r)
	}))
	defer srv.Close()
	engine := New(policy.Set{Single: &policy.Policy{
		Rules:        []policy.Rule{{ID: "ALLOW_ROUTE", Effect: "ALLOW", Reason: "approved", Sources: []string{"caller"}, Destinations: []string{"target"}}},
		ContentRules: []policy.ContentRule{{ID: "NO_SECRET", Reason: "no secrets", Pattern: "secret-value", Evidence: policy.EvidenceToolInput, Destinations: []string{"target"}}},
	}}, Options{MasID: func() (string, error) { return "mas", nil }, OXPURL: srv.URL, Wait: 300 * time.Millisecond, Attempts: 3, RetryWait: 20 * time.Millisecond})
	out, err := engine.Evaluate(context.Background(), realtimeRequest(map[string]string{"ioc.observe.event_id": "msg1"}))
	if err != nil || out.Outcome != cev1.Decision_DECISION_DENY || out.MissingContextCause != cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_RACE {
		t.Fatalf("%+v %v", out, err)
	}
}

func TestRealtimeFailureKeepsTheInboxBehavior(t *testing.T) {
	for _, status := range []int{http.StatusInternalServerError, http.StatusBadGateway} {
		f := &fakeRealtime{status: status}
		in := inbox.New("noa-trip-planner-mas", 16)
		event := llmFixture(t, "a2a_tool_started.json")
		pushEvent(t, in, event)
		refs := event["correlation"].(map[string]any)
		r := spanRequest(refs["span_id"].(string))
		r.TraceId = refs["trace_id"].(string)
		r.Extra = map[string]string{"ioc.observe.session_id": event["session"].(map[string]any)["id"].(string), "ioc.observe.precall_event_id": "pre1", "ioc.observe.event_id": "msg1"}
		out, err := realtimeEngine(t, policy.EvidenceA2AMessageInput, f, in).Evaluate(context.Background(), r)
		if err != nil || out.Outcome != cev1.Decision_DECISION_ALLOW || hasCheck(out, "OXP_REALTIME_EVENT") || out.ContextSufficiency != cev1.ContextSufficiency_CONTEXT_SUFFICIENCY_COMPLETE {
			t.Fatalf("status %d: %+v %v", status, out, err)
		}
	}
}

func TestRealtimeContradictoryReferencesAreAGap(t *testing.T) {
	other := "fedcba9876543210"
	for name, tc := range map[string]struct {
		events []map[string]any
		extra  map[string]string
	}{
		"wrong span":  {[]map[string]any{realtimeEvent("pre1", "msg1", trace, other, "ordinary trip")}, map[string]string{"ioc.observe.precall_event_id": "pre1"}},
		"wrong trace": {[]map[string]any{realtimeEvent("pre1", "msg1", "ffffffffffffffffffffffffffffffff", span, "ordinary trip")}, map[string]string{"ioc.observe.precall_event_id": "pre1"}},
		"wrong type": {[]map[string]any{func() map[string]any {
			e := realtimeEvent("pre1", "msg1", trace, span, "x")
			e["type"] = "tool.completed"
			return e
		}()}, map[string]string{"ioc.observe.precall_event_id": "pre1"}},
		"ambiguous children": {[]map[string]any{realtimeEvent("a", "msg1", trace, span, "ordinary trip"), realtimeEvent("b", "msg1", trace, span, "secret-value")}, map[string]string{"ioc.observe.event_id": "msg1"}},
	} {
		t.Run(name, func(t *testing.T) {
			f := &fakeRealtime{events: tc.events}
			out, err := realtimeEngine(t, policy.EvidenceToolInput, f, nil).Evaluate(context.Background(), realtimeRequest(tc.extra))
			if err != nil || out.Outcome != cev1.Decision_DECISION_DENY || out.MissingContextCause != cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_GAP {
				t.Fatalf("%+v %v", out, err)
			}
		})
	}
}

func TestRealtimeDirectIDWinsOverTheParentLookup(t *testing.T) {
	f := &fakeRealtime{}
	f.add(realtimeEvent("pre1", "msg1", trace, span, "ordinary trip"))
	f.add(realtimeEvent("pre2", "msg1", trace, span, "secret-value"))
	out, err := realtimeEngine(t, policy.EvidenceToolInput, f, nil).Evaluate(context.Background(), realtimeRequest(map[string]string{"ioc.observe.precall_event_id": "pre1", "ioc.observe.event_id": "msg1"}))
	if err != nil || out.Outcome != cev1.Decision_DECISION_ALLOW {
		t.Fatalf("%+v %v", out, err)
	}
}

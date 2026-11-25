// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package engine

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	cev1 "github.com/ioc-project/cognition-fabric/api/ce/v1"
	"github.com/ioc-project/cognition-fabric/samples/demo-ce/internal/inbox"
	"github.com/ioc-project/cognition-fabric/samples/demo-ce/pkg/config"
)

func evidenceSpan(id, parent, kind string, attrs map[string]string) map[string]any {
	return map[string]any{"span_id": id, "session_id": sessionID, "span_name": "lookup." + kind, "span_type": kind,
		"parent_span_id": parent, "timestamp": "2026-10-16 13:00:00.000000000", "span_attributes": attrs}
}

func spanEngine(t *testing.T, kind string, wait time.Duration, handler http.HandlerFunc) *Router {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return New(config.Set{Single: &config.Config{
		Rules:        []config.Rule{{ID: "ALLOW_ROUTE", Effect: "ALLOW", Reason: "approved", Sources: []string{"caller"}, Destinations: []string{"target"}}},
		ContentRules: []config.ContentRule{{ID: "NO_SECRET", Reason: "no secrets", Pattern: "secret-value", Evidence: kind, Destinations: []string{"target"}}},
	}}, Options{MasID: func() (string, error) { return "mas", nil }, OXPURL: srv.URL, Wait: wait})
}

func TestUnifiedContextUsesNativePreCallInputAndOXPHistory(t *testing.T) {
	in := inbox.New("noa-trip-planner-mas", 16)
	event := llmFixture(t, "a2a_tool_started.json")
	pushEvent(t, in, event)
	refs := event["correlation"].(map[string]any)
	eventSession := event["session"].(map[string]any)["id"].(string)
	activity := refs["span_id"].(string)
	_, oxpSession, _ := strings.Cut(eventSession, "_")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/sessions/"+oxpSession+"/spans" {
			t.Errorf("wrong session: %s", r.URL)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"spans": []any{
			map[string]any{"span_id": activity, "session_id": oxpSession, "span_type": "send_message", "parent_span_id": "1111111111111111", "span_attributes": map[string]string{}},
			map[string]any{"span_id": "1111111111111111", "session_id": oxpSession, "span_type": "tool", "span_attributes": map[string]string{"ioa_observe.entity.input": `{"kwargs":{"task":"context"}}`}},
		}})
	}))
	defer srv.Close()
	p := config.Config{Rules: []config.Rule{{ID: "A", Effect: "ALLOW", Reason: "approved", Sources: []string{"caller"}, Destinations: []string{"target"}}},
		ContentRules: []config.ContentRule{{ID: "C", Reason: "no impossible text", Pattern: "impossible-marker", Evidence: config.EvidenceA2AMessageInput, Destinations: []string{"target"}}}}
	engine := New(config.Set{Single: &p}, Options{MasID: func() (string, error) { return "mas", nil }, OXPURL: srv.URL, Inbox: in, Wait: time.Second})
	r := spanRequest(activity)
	r.TraceId = refs["trace_id"].(string)
	r.Extra = nil // native LLM/A2A events can supply the session even when metadata does not.
	out, err := engine.Evaluate(context.Background(), r)
	if err != nil || out.Outcome != cev1.Decision_DECISION_ALLOW {
		t.Fatalf("%+v %v", out, err)
	}
	found := false
	for _, check := range diagnostics(t, out).ChecksRun {
		found = found || check.CheckId == "OXP_CAUSAL_CONTEXT" && check.Passed
	}
	if !found {
		t.Fatalf("native input was not joined to OXP context: %+v", out)
	}
}

func spanRequest(id string) *cev1.EvaluateRequest {
	return &cev1.EvaluateRequest{MasId: "mas", SourceAgentId: "caller", DestinationAgentId: "target", TraceId: trace, SpanId: id,
		Extra: map[string]string{"ioc.observe.session_id": sessionID, "ioc.item.kind": "tool_call"}}
}

func TestOXPFallbackJudgesActualInputShapes(t *testing.T) {
	for _, tc := range []struct {
		name, kind, spanType string
		attrs                map[string]string
	}{
		{"decorated tool", config.EvidenceToolInput, "tool", map[string]string{"ioa_observe.entity.input": `{"args":[],"kwargs":{"query":"secret-value"}}`}},
		{"A2A tool wrapper", config.EvidenceA2AMessageInput, "tool", map[string]string{"ioa_observe.entity.input": `{"args":[],"kwargs":{"task":"secret-value"}}`}},
		{"MCP raw request", config.EvidenceMCPToolInput, "mcp", map[string]string{"ioa_observe.entity.input": `{"method":"tools/call","params":{"name":"lookup","arguments":{"query":"secret-value"}},"id":"1"}`}},
		{"MCP request attributes", config.EvidenceMCPToolInput, "mcp", map[string]string{"mcp.method.name": "tools/call", "mcp.request.argument": `{"name":"lookup","arguments":{"query":"secret-value"}}`}},
		{"MCP serialized root and params", config.EvidenceMCPToolInput, "mcp", map[string]string{"ioa_observe.entity.input": `{"root":"{\"method\":\"tools/call\",\"params\":\"{\\\"name\\\":\\\"lookup\\\",\\\"arguments\\\":{\\\"query\\\":\\\"secret-value\\\"}}\"}"}`}},
		{"model input", config.EvidenceLLMInput, "llm", map[string]string{"gen_ai.input.messages": `[{"role":"user","parts":[{"type":"text","content":"secret-value"}]}]`}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			engine := spanEngine(t, tc.kind, time.Second, func(w http.ResponseWriter, r *http.Request) {
				_ = json.NewEncoder(w).Encode(map[string]any{"spans": []any{evidenceSpan(span, "", tc.spanType, tc.attrs)}})
			})
			out, err := engine.Evaluate(context.Background(), spanRequest(span))
			if err != nil || out.Outcome != cev1.Decision_DECISION_DENY || diagnostics(t, out).GetDenialReason() != cev1.DenialReason_DENIAL_REASON_DEVIATES_FROM_INTENT || !strings.Contains(out.Reason, "NO_SECRET") {
				t.Fatalf("input was not judged: %+v %v", out, err)
			}
		})
	}
}

func TestOXPFallbackSeparatesParallelCallsToTheSameTool(t *testing.T) {
	engine := spanEngine(t, config.EvidenceToolInput, time.Second, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"spans": []any{
			evidenceSpan("1111111111111111", "", "tool", map[string]string{"ioa_observe.entity.input": `{"kwargs":{"query":"ordinary trip"}}`}),
			evidenceSpan("2222222222222222", "", "tool", map[string]string{"ioa_observe.entity.input": `{"kwargs":{"query":"secret-value"}}`}),
		}})
	})
	var wg sync.WaitGroup
	for id, want := range map[string]cev1.Decision{"1111111111111111": cev1.Decision_DECISION_ALLOW, "2222222222222222": cev1.Decision_DECISION_DENY} {
		wg.Go(func() {
			out, err := engine.Evaluate(context.Background(), spanRequest(id))
			if err != nil || out.Outcome != want {
				t.Errorf("span %s: %+v %v", id, out, err)
			}
		})
	}
	wg.Wait()
}

func TestOXPFallbackDoesNotJudgeASiblingsOrAncestorsContent(t *testing.T) {
	engine := spanEngine(t, config.EvidenceToolInput, time.Second, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"spans": []any{
			evidenceSpan("1111111111111111", "", "llm", map[string]string{"gen_ai.input.messages": `[{"role":"user","parts":[{"type":"text","content":"secret-value"}]}]`}),
			evidenceSpan(span, "1111111111111111", "tool", map[string]string{"ioa_observe.entity.input": `{"kwargs":{"query":"ordinary trip"}}`}),
			evidenceSpan("2222222222222222", "1111111111111111", "tool", map[string]string{"ioa_observe.entity.input": `{"kwargs":{"query":"secret-value"}}`}),
		}})
	})
	out, err := engine.Evaluate(context.Background(), spanRequest(span))
	if err != nil || out.Outcome != cev1.Decision_DECISION_ALLOW {
		t.Fatalf("unrelated text judged: %+v %v", out, err)
	}
	found := false
	for _, check := range diagnostics(t, out).ChecksRun {
		found = found || check.CheckId == "OXP_CAUSAL_CONTEXT" && check.Passed
	}
	if !found || diagnostics(t, out).GetContextSufficiency() != cev1.ContextSufficiency_CONTEXT_SUFFICIENCY_DEGRADED_ATOMIC {
		t.Fatalf("session/span context must not claim confirmed trace identity: %+v", out)
	}
}

func TestOXPFallbackWaitsForActivityAndItsCausalContext(t *testing.T) {
	var calls atomic.Int32
	engine := spanEngine(t, config.EvidenceToolInput, time.Second, func(w http.ResponseWriter, r *http.Request) {
		rows := []any{evidenceSpan(span, "1111111111111111", "tool", map[string]string{"ioa_observe.entity.input": `{"kwargs":{"query":"secret-value"}}`})}
		if calls.Add(1) > 1 {
			rows = append(rows, evidenceSpan("1111111111111111", "", "agent", nil))
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"spans": rows})
	})
	out, err := engine.Evaluate(context.Background(), spanRequest(span))
	if err != nil || out.Outcome != cev1.Decision_DECISION_DENY || diagnostics(t, out).GetDenialReason() != cev1.DenialReason_DENIAL_REASON_DEVIATES_FROM_INTENT || calls.Load() < 2 {
		t.Fatalf("did not await parent: %+v %v", out, err)
	}
}

func TestOXPFallbackMissingEvidenceFailsWithinCallerDeadline(t *testing.T) {
	engine := spanEngine(t, config.EvidenceToolInput, time.Second, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"spans": []any{}})
	})
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Millisecond)
	defer cancel()
	start := time.Now()
	out, err := engine.Evaluate(ctx, spanRequest(span))
	if err != nil || out.Outcome != cev1.Decision_DECISION_DENY || diagnostics(t, out).GetDenialReason() != cev1.DenialReason_DENIAL_REASON_MISSING_CONTEXT || diagnostics(t, out).GetMissingContextCause() != cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_RACE {
		t.Fatalf("%+v %v", out, err)
	}
	if time.Since(start) > 400*time.Millisecond {
		t.Fatal("caller deadline was ignored")
	}
}

func TestOXPFallbackNeverGuessesInputFromAnotherSpan(t *testing.T) {
	engine := spanEngine(t, config.EvidenceA2AMessageInput, 40*time.Millisecond, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"spans": []any{
			evidenceSpan(span, "1111111111111111", "send_message", nil),
			evidenceSpan("1111111111111111", "", "tool", map[string]string{"ioa_observe.entity.input": `{"kwargs":{"task":"ordinary trip"}}`}),
		}})
	})
	out, err := engine.Evaluate(context.Background(), spanRequest(span))
	if err != nil || out.Outcome != cev1.Decision_DECISION_DENY || diagnostics(t, out).GetDenialReason() != cev1.DenialReason_DENIAL_REASON_MISSING_CONTEXT {
		t.Fatalf("invented current input: %+v %v", out, err)
	}
}

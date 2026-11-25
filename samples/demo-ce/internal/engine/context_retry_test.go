// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package engine

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	cev1 "github.com/ioc-project/cognition-fabric/api/ce/v1"
	"github.com/ioc-project/cognition-fabric/samples/demo-ce/internal/inbox"
	"github.com/ioc-project/cognition-fabric/samples/demo-ce/pkg/config"
)

func retryEngine(t *testing.T, options Options, handler http.HandlerFunc) *Router {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	options.OXPURL = server.URL
	options.MasID = func() (string, error) { return "mas", nil }
	return New(config.Set{Single: &config.Config{
		Rules:        []config.Rule{{ID: "ALLOW_ROUTE", Effect: "ALLOW", Reason: "approved", Sources: []string{"caller"}, Destinations: []string{"target"}}},
		ContentRules: []config.ContentRule{{ID: "NO_SECRET", Reason: "no secrets", Pattern: "secret-value", Evidence: config.EvidenceToolInput, Destinations: []string{"target"}}},
	}}, options)
}

// Removing the attempt cap would reach the next response and incorrectly ALLOW.
func TestContextAttemptsStopBeforeAnAdditionalLookup(t *testing.T) {
	for _, attempts := range []int{1, 3} {
		t.Run(strconv.Itoa(attempts), func(t *testing.T) {
			var calls atomic.Int32
			engine := retryEngine(t, Options{Wait: time.Second, Attempts: attempts, RetryWait: 10 * time.Millisecond}, func(w http.ResponseWriter, _ *http.Request) {
				rows := []any{}
				if calls.Add(1) > int32(attempts) {
					rows = append(rows, evidenceSpan(span, "", "tool", map[string]string{"ioa_observe.entity.input": `{"kwargs":{"query":"ordinary trip"}}`}))
				}
				_ = json.NewEncoder(w).Encode(map[string]any{"spans": rows})
			})
			out, err := engine.Evaluate(context.Background(), spanRequest(span))
			if err != nil || out.Outcome != cev1.Decision_DECISION_DENY || diagnostics(t, out).GetMissingContextCause() != cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_RACE || calls.Load() != int32(attempts) {
				t.Fatalf("attempt limit not enforced: out=%+v err=%v lookups=%d", out, err, calls.Load())
			}
		})
	}
}

// A second lookup before the configured wait would ALLOW from stale data.
func TestContextRetryWaitDelaysTheNextLookup(t *testing.T) {
	var calls atomic.Int32
	first := make(chan time.Time, 1)
	engine := retryEngine(t, Options{Wait: time.Second, Attempts: 2, RetryWait: 150 * time.Millisecond}, func(w http.ResponseWriter, _ *http.Request) {
		rows := []any{}
		if calls.Add(1) == 1 {
			first <- time.Now()
		} else {
			query := "ordinary trip"
			if time.Since(<-first) >= 150*time.Millisecond {
				query = "secret-value"
			}
			rows = append(rows, evidenceSpan(span, "", "tool", map[string]string{"ioa_observe.entity.input": `{"kwargs":{"query":"` + query + `"}}`}))
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"spans": rows})
	})
	out, err := engine.Evaluate(context.Background(), spanRequest(span))
	if err != nil || out.Outcome != cev1.Decision_DECISION_DENY || !strings.Contains(out.Reason, "NO_SECRET") || calls.Load() != 2 {
		t.Fatalf("retry did not wait for fresh input: out=%+v err=%v lookups=%d", out, err, calls.Load())
	}
}

func TestContextRetryWaitRespectsCallerAndSharedBudget(t *testing.T) {
	for _, callerLimited := range []bool{false, true} {
		t.Run(map[bool]string{false: "shared budget", true: "caller deadline"}[callerLimited], func(t *testing.T) {
			var calls atomic.Int32
			wait := 80 * time.Millisecond
			ctx := context.Background()
			if callerLimited {
				wait = time.Second
				var cancel context.CancelFunc
				ctx, cancel = context.WithTimeout(ctx, 80*time.Millisecond)
				defer cancel()
			}
			engine := retryEngine(t, Options{Wait: wait, Attempts: 5, RetryWait: time.Second}, func(w http.ResponseWriter, _ *http.Request) {
				calls.Add(1)
				_ = json.NewEncoder(w).Encode(map[string]any{"spans": []any{}})
			})
			started := time.Now()
			out, err := engine.Evaluate(ctx, spanRequest(span))
			if err != nil || out.Outcome != cev1.Decision_DECISION_DENY || diagnostics(t, out).GetMissingContextCause() != cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_RACE || calls.Load() != 1 || time.Since(started) > 500*time.Millisecond {
				t.Fatalf("retry outlived its budget: out=%+v err=%v lookups=%d elapsed=%s", out, err, calls.Load(), time.Since(started))
			}
		})
	}
}

func TestPreCallInputInterruptsTheRetryWait(t *testing.T) {
	in := inbox.New("noa-trip-planner-mas", 16)
	entered := make(chan struct{}, 1)
	var calls atomic.Int32
	engine := retryEngine(t, Options{Wait: time.Second, Attempts: 5, RetryWait: time.Second, Inbox: in}, func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		select {
		case entered <- struct{}{}:
		default:
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"spans": []any{}})
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
		t.Fatal("initial lookup did not start")
	}
	pushEvent(t, in, event)
	select {
	case out := <-done:
		if out == nil || out.Outcome != cev1.Decision_DECISION_DENY || !strings.Contains(out.Reason, "NO_SECRET") || diagnostics(t, out).GetContextSufficiency() != cev1.ContextSufficiency_CONTEXT_SUFFICIENCY_COMPLETE {
			t.Fatalf("pre-call input was missed during retry wait: %+v", out)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("pre-call input waited for the retry interval")
	}
}

func TestInboxChangesDoNotRepeatOXPLookupsWithinAnAttempt(t *testing.T) {
	in := inbox.New("noa-trip-planner-mas", 64)
	event := llmFixture(t, "a2a_tool_started.json")
	pushEvent(t, in, event)
	var calls atomic.Int32
	engine := retryEngine(t, Options{Wait: time.Second, Attempts: 1, RetryWait: time.Second, Inbox: in}, func(w http.ResponseWriter, _ *http.Request) {
		update := llmFixture(t, "a2a_tool_started.json")
		update["type"] = "tool.completed"
		update["session"].(map[string]any)["sequence"] = 100 + int(calls.Add(1))
		pushEvent(t, in, update)
		_ = json.NewEncoder(w).Encode(map[string]any{"spans": []any{}})
	})
	out, err := engine.Evaluate(context.Background(), eventRequest(event))
	if err != nil || out.Outcome != cev1.Decision_DECISION_ALLOW || calls.Load() != 1 {
		t.Fatalf("inbox updates bypassed the attempt limit: out=%+v err=%v lookups=%d", out, err, calls.Load())
	}
}
